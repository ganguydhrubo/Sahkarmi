import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AiAccount, AiAccountProvider, AiAccountsState } from "../shared/ipc";
import { JsonFile } from "./json-file";
import { isRecord } from "./protocol";

/**
 * Several accounts of the same AI (two ChatGPT accounts, two Claude accounts), so work goes on
 * when one account runs out of its limit. Sahkarmi itself has no login: these are only the AI
 * sign-ins.
 *
 * Each AI keeps its sign-in in a small file (ChatGPT: <CODEX_HOME>/auth.json; Claude:
 * <CLAUDE_CONFIG_DIR>/.credentials.json plus the account profile in .claude.json). Sahkarmi keeps
 * a sealed copy for every account and puts the chosen account's copy in place while the AI is
 * stopped. Chats, files and coworkers stay where they are, so a coworker carries on the same chat
 * on the other account.
 *
 * Which account a sign-in belongs to is read from the sign-in itself (the email inside it), never
 * from a status that may still show the previous account.
 */

export const AI_ACCOUNT_PROVIDERS: readonly AiAccountProvider[] = ["codex", "claude"];

/** How long an account that hit its limit is skipped when the AI gave no reset time. */
export const ACCOUNT_LIMIT_COOLDOWN_MS = 60 * 60_000;

interface StoredAccount {
  id: string;
  email: string | null;
  addedAt: string;
  /** ISO time until which this account is skipped after a usage limit; null when it is fine. */
  limitUntil: string | null;
}

interface ProviderAccounts {
  /** The account whose sign-in is in place now; null while a new account is being added. */
  activeId: string | null;
  accounts: StoredAccount[];
}

interface AccountsFile {
  version: 1;
  providers: Partial<Record<AiAccountProvider, ProviderAccounts>>;
}

/** What is kept for one account: the sign-in file and, for Claude, its account profile. */
interface SignInCopy {
  credentials: string;
  profile?: unknown;
}

/** Turns sign-in text into what is written to disk and back (DPAPI on Windows). */
export interface CredentialSeal {
  seal(value: string): string;
  /** Null when it was sealed on another PC or Windows user and cannot be read. */
  open(value: string): string | null;
}

const PLAIN: CredentialSeal = { seal: (value) => value, open: (value) => value };

/** Where each AI keeps its sign-in on this computer. */
export interface LiveSignInFiles {
  credentials(provider: AiAccountProvider): string;
  /** Claude's settings file that holds `oauthAccount` (who is signed in). */
  claudeProfile(): string;
}

/** What AgentService needs to move an AI to its next account at a usage limit. */
export interface AiAccountSource {
  activeId(provider: AiAccountProvider): string | null;
  /** The next saved account of this AI that is not resting after a limit, or null. */
  nextAccount(provider: AiAccountProvider, exclude: ReadonlySet<string>): string | null;
  label(provider: AiAccountProvider, id: string): string;
  /** Rests the account in use after a usage limit. */
  markLimited(provider: AiAccountProvider, untilMs?: number): Promise<void>;
  /** Puts this account's sign-in in place. Run only while the AI is stopped. */
  activate(provider: AiAccountProvider, id: string): Promise<void>;
}

export function isAiAccountProvider(value: unknown): value is AiAccountProvider {
  return value === "codex" || value === "claude";
}

/** The sign-in files of the folders Sahkarmi starts each AI with. */
export function liveSignInFiles(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): LiveSignInFiles {
  const claudeDir = () => env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude");
  return {
    credentials: (provider) =>
      provider === "codex"
        ? join(env.CODEX_HOME?.trim() || join(home, ".codex"), "auth.json")
        : join(claudeDir(), ".credentials.json"),
    // With its own config folder, Claude keeps .claude.json inside it; otherwise in the home.
    claudeProfile: () =>
      env.CLAUDE_CONFIG_DIR?.trim()
        ? join(claudeDir(), ".claude.json")
        : join(home, ".claude.json"),
  };
}

/** The email inside a ChatGPT sign-in (the id_token's claims), or null. */
export function codexSignInEmail(authJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(authJson);
    if (!isRecord(parsed) || !isRecord(parsed.tokens)) return null;
    const token = parsed.tokens.id_token;
    if (typeof token !== "string") return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isRecord(claims)) return null;
    const profile = claims["https://api.openai.com/profile"];
    const email =
      (typeof claims.email === "string" && claims.email) ||
      (isRecord(profile) && typeof profile.email === "string" && profile.email) ||
      null;
    return email || null;
  } catch {
    return null;
  }
}

export class AiAccountStore implements AiAccountSource {
  readonly #file: JsonFile<AccountsFile>;
  readonly #root: string;
  readonly #seal: CredentialSeal;
  readonly #live: LiveSignInFiles;
  readonly #now: () => number;
  #state: AccountsFile = fresh();

  constructor(
    userDataPath: string,
    options: { seal?: CredentialSeal; live?: LiveSignInFiles; now?: () => number } = {},
  ) {
    this.#file = new JsonFile(join(userDataPath, "ai-accounts.json"));
    this.#root = join(userDataPath, "ai-accounts");
    this.#seal = options.seal ?? PLAIN;
    this.#live = options.live ?? liveSignInFiles();
    this.#now = options.now ?? Date.now;
  }

  async initialize(): Promise<void> {
    this.#state = await this.#file.read(fresh, isAccountsFile);
  }

  list(): AiAccountsState {
    const now = this.#now();
    const providers = {} as AiAccountsState["providers"];
    for (const provider of AI_ACCOUNT_PROVIDERS) {
      const entry = this.#entry(provider);
      providers[provider] = {
        adding: entry.activeId === null && entry.accounts.length > 0,
        accounts: entry.accounts.map(
          (account): AiAccount => ({
            id: account.id,
            email: account.email,
            active: account.id === entry.activeId,
            restingUntil:
              account.limitUntil && Date.parse(account.limitUntil) > now
                ? account.limitUntil
                : null,
          }),
        ),
      };
    }
    return { providers };
  }

  activeId(provider: AiAccountProvider): string | null {
    return this.#entry(provider).activeId;
  }

  label(provider: AiAccountProvider, id: string): string {
    const entry = this.#entry(provider);
    const index = entry.accounts.findIndex((account) => account.id === id);
    return entry.accounts[index]?.email ?? `account ${index + 1}`;
  }

  /**
   * Keeps a copy of the sign-in in place under its account (found by the email inside the
   * sign-in; a new account when the email is new). Does nothing when the AI is not signed in.
   */
  async capture(provider: AiAccountProvider): Promise<void> {
    const live = await this.#readLive(provider);
    if (!live) return;
    const entry = this.#entry(provider);
    const known = live.email
      ? entry.accounts.find((account) => account.email?.toLowerCase() === live.email?.toLowerCase())
      : undefined;
    const current = entry.accounts.find((account) => account.id === entry.activeId);
    // No email to go by: the sign-in in place belongs to the account in use, if there is one.
    let account = known ?? (!live.email ? current : undefined);
    if (!account) {
      account = {
        id: randomUUID(),
        email: live.email,
        addedAt: new Date(this.#now()).toISOString(),
        limitUntil: null,
      };
      entry.accounts.push(account);
    }
    if (live.email) account.email = live.email;
    await this.#writeCopy(provider, account.id, live.copy);
    entry.activeId = account.id;
    await this.#save();
  }

  /**
   * Makes room for another account: the account in place is kept, then its sign-in file is
   * taken away so Connect signs in fresh. The kept account can be chosen again at any time.
   */
  async beginAdd(provider: AiAccountProvider): Promise<void> {
    const entry = this.#entry(provider);
    if (!entry.activeId) {
      if (entry.accounts.length === 0) {
        throw new Error("Connect this AI first. Then you can add another account.");
      }
      return; // Already waiting for the new account's sign-in.
    }
    if (!(await this.#keepLive(provider))) {
      throw new Error(
        "Sahkarmi could not find this AI's sign-in file on this computer, so it cannot keep two accounts.",
      );
    }
    await rm(this.#live.credentials(provider), { force: true });
    entry.activeId = null;
    await this.#save();
  }

  async activate(provider: AiAccountProvider, id: string): Promise<void> {
    const entry = this.#entry(provider);
    if (!entry.accounts.some((candidate) => candidate.id === id)) {
      throw new Error("That account is not saved any more.");
    }
    if (entry.activeId === id) return;
    // The AI may have refreshed its sign-in since it was saved: keep the newest copy first.
    await this.#keepLive(provider);
    const copy = await this.#readCopy(provider, id);
    if (!copy) {
      throw new Error("This account's saved sign-in cannot be read. Remove it and add it again.");
    }
    await this.#writeLive(provider, copy);
    entry.activeId = id;
    await this.#save();
  }

  async remove(provider: AiAccountProvider, id: string): Promise<void> {
    const entry = this.#entry(provider);
    if (entry.activeId === id && entry.accounts.length > 1) {
      throw new Error(
        "This account is in use. Choose another account first, then remove this one.",
      );
    }
    entry.accounts = entry.accounts.filter((account) => account.id !== id);
    if (entry.activeId === id) entry.activeId = null;
    await rm(this.#copyPath(provider, id), { force: true });
    await this.#save();
  }

  /** After Disconnect: the signed-out account is forgotten; the other saved accounts stay. */
  async forgetActive(provider: AiAccountProvider): Promise<void> {
    const entry = this.#entry(provider);
    const id = entry.activeId;
    if (!id) return;
    entry.accounts = entry.accounts.filter((account) => account.id !== id);
    entry.activeId = null;
    await rm(this.#copyPath(provider, id), { force: true });
    await this.#save();
  }

  nextAccount(provider: AiAccountProvider, exclude: ReadonlySet<string>): string | null {
    const entry = this.#entry(provider);
    const now = this.#now();
    const start = Math.max(
      0,
      entry.accounts.findIndex((account) => account.id === entry.activeId),
    );
    for (let step = 1; step <= entry.accounts.length; step += 1) {
      const account = entry.accounts[(start + step) % entry.accounts.length];
      if (!account || account.id === entry.activeId || exclude.has(account.id)) continue;
      if (account.limitUntil && Date.parse(account.limitUntil) > now) continue;
      return account.id;
    }
    return null;
  }

  async markLimited(provider: AiAccountProvider, untilMs?: number): Promise<void> {
    const entry = this.#entry(provider);
    const account = entry.accounts.find((candidate) => candidate.id === entry.activeId);
    if (!account) return;
    account.limitUntil = new Date(untilMs ?? this.#now() + ACCOUNT_LIMIT_COOLDOWN_MS).toISOString();
    await this.#save();
  }

  async #readLive(
    provider: AiAccountProvider,
  ): Promise<{ copy: SignInCopy; email: string | null } | null> {
    const credentials = await readFile(this.#live.credentials(provider), "utf8").catch(() => null);
    if (!credentials?.trim()) return null;
    if (provider === "codex")
      return { copy: { credentials }, email: codexSignInEmail(credentials) };
    const settings = await readJson(this.#live.claudeProfile());
    const profile = isRecord(settings) ? settings.oauthAccount : undefined;
    const email =
      isRecord(profile) && typeof profile.emailAddress === "string" ? profile.emailAddress : null;
    return { copy: { credentials, ...(profile ? { profile } : {}) }, email };
  }

  async #writeLive(provider: AiAccountProvider, copy: SignInCopy): Promise<void> {
    const path = this.#live.credentials(provider);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, copy.credentials, { encoding: "utf8", mode: 0o600 });
    if (provider !== "claude" || copy.profile === undefined) return;
    // Claude shows and checks the account from `oauthAccount`; every other setting stays.
    const profilePath = this.#live.claudeProfile();
    const settings = await readJson(profilePath);
    const next = { ...(isRecord(settings) ? settings : {}), oauthAccount: copy.profile };
    await writeFile(profilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  /** Saves the sign-in in place under the account in use. False when there is none to save. */
  async #keepLive(provider: AiAccountProvider): Promise<boolean> {
    const entry = this.#entry(provider);
    if (!entry.activeId) return false;
    const live = await this.#readLive(provider);
    const owner = entry.accounts.find((account) => account.id === entry.activeId);
    // A sign-in that clearly belongs to someone else is never saved under this account.
    if (
      live &&
      !(live.email && owner?.email && live.email.toLowerCase() !== owner.email.toLowerCase())
    ) {
      await this.#writeCopy(provider, entry.activeId, live.copy);
      return true;
    }
    // Signed out already: the copy kept earlier still counts.
    return (await this.#readCopy(provider, entry.activeId)) !== null;
  }

  async #writeCopy(provider: AiAccountProvider, id: string, copy: SignInCopy): Promise<void> {
    const path = this.#copyPath(provider, id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, this.#seal.seal(JSON.stringify(copy)), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async #readCopy(provider: AiAccountProvider, id: string): Promise<SignInCopy | null> {
    const raw = await readFile(this.#copyPath(provider, id), "utf8").catch(() => null);
    const text = raw === null ? null : this.#seal.open(raw);
    if (!text) return null;
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) && typeof parsed.credentials === "string"
        ? {
            credentials: parsed.credentials,
            ...(parsed.profile ? { profile: parsed.profile } : {}),
          }
        : null;
    } catch {
      return null;
    }
  }

  #copyPath(provider: AiAccountProvider, id: string): string {
    if (!/^[\w-]{1,64}$/.test(id)) throw new Error("Unknown account.");
    return join(this.#root, provider, `${id}.sign-in`);
  }

  #entry(provider: AiAccountProvider): ProviderAccounts {
    let entry = this.#state.providers[provider];
    if (!entry) {
      entry = { activeId: null, accounts: [] };
      this.#state.providers[provider] = entry;
    }
    return entry;
  }

  async #save(): Promise<void> {
    await this.#file.write(this.#state);
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function fresh(): AccountsFile {
  return { version: 1, providers: {} };
}

function isAccountsFile(value: unknown): value is AccountsFile {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.providers)) return false;
  return Object.entries(value.providers).every(
    ([provider, entry]) =>
      isAiAccountProvider(provider) &&
      isRecord(entry) &&
      (entry.activeId === null || typeof entry.activeId === "string") &&
      Array.isArray(entry.accounts) &&
      entry.accounts.every(
        (account) =>
          isRecord(account) &&
          typeof account.id === "string" &&
          (account.email === null || typeof account.email === "string"),
      ),
  );
}
