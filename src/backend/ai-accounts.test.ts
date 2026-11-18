import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiAccountStore, codexSignInEmail, type LiveSignInFiles } from "./ai-accounts";

function idToken(email: string): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({ email })}.sig`;
}

function codexAuth(email: string, refresh = "r1"): string {
  return JSON.stringify({ tokens: { id_token: idToken(email), refresh_token: refresh } });
}

describe("several accounts of one AI", () => {
  let root: string;
  let live: LiveSignInFiles;
  let now: number;
  const store = () =>
    new AiAccountStore(join(root, "userData"), {
      live,
      now: () => now,
      seal: { seal: (value) => `sealed:${value}`, open: (value) => value.slice("sealed:".length) },
    });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sk-ai-accounts-"));
    now = Date.parse("2026-11-18T10:00:00Z");
    live = {
      credentials: (provider) =>
        provider === "codex"
          ? join(root, "codex", "auth.json")
          : join(root, "claude", ".credentials.json"),
      claudeProfile: () => join(root, "claude", ".claude.json"),
    };
    await mkdir(join(root, "codex"), { recursive: true });
    await mkdir(join(root, "claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads the email inside a ChatGPT sign-in", () => {
    expect(codexSignInEmail(codexAuth("owner@shop.in"))).toBe("owner@shop.in");
    expect(codexSignInEmail("not json")).toBeNull();
  });

  it("keeps a second ChatGPT account and moves between them without mixing them up", async () => {
    const accounts = store();
    await accounts.initialize();
    await writeFile(live.credentials("codex"), codexAuth("first@shop.in"));
    await accounts.capture("codex");
    const first = accounts.activeId("codex");
    expect(accounts.list().providers.codex.accounts).toEqual([
      { id: first, email: "first@shop.in", active: true, restingUntil: null },
    ]);

    // Add another: the first is kept, the sign-in file is taken away for a fresh sign-in.
    await accounts.beginAdd("codex");
    await expect(readFile(live.credentials("codex"), "utf8")).rejects.toThrow();
    expect(accounts.list().providers.codex.adding).toBe(true);

    await writeFile(live.credentials("codex"), codexAuth("second@shop.in"));
    await accounts.capture("codex");
    const second = accounts.activeId("codex");
    expect(second).not.toBe(first);
    expect(accounts.list().providers.codex.accounts.map((account) => account.email)).toEqual([
      "first@shop.in",
      "second@shop.in",
    ]);

    // The second account refreshed its sign-in while in use; switching keeps the newest copy.
    await writeFile(live.credentials("codex"), codexAuth("second@shop.in", "r2"));
    await accounts.activate("codex", first as string);
    expect(codexSignInEmail(await readFile(live.credentials("codex"), "utf8"))).toBe(
      "first@shop.in",
    );
    await accounts.activate("codex", second as string);
    expect(await readFile(live.credentials("codex"), "utf8")).toContain('"r2"');

    // Saved copies are sealed, never plain.
    const saved = await readFile(
      join(root, "userData", "ai-accounts", "codex", `${first}.sign-in`),
      "utf8",
    );
    expect(saved.startsWith("sealed:")).toBe(true);

    // The list survives a restart.
    const again = store();
    await again.initialize();
    expect(again.activeId("codex")).toBe(second);
  });

  it("swaps Claude's account profile with its sign-in and keeps other settings", async () => {
    const accounts = store();
    await accounts.initialize();
    const profile = (email: string) => ({ theme: "light", oauthAccount: { emailAddress: email } });
    await writeFile(live.credentials("claude"), '{"claudeAiOauth":{"refreshToken":"a"}}');
    await writeFile(live.claudeProfile(), JSON.stringify(profile("ca@office.in")));
    await accounts.capture("claude");
    const first = accounts.activeId("claude") as string;

    await accounts.beginAdd("claude");
    await writeFile(live.credentials("claude"), '{"claudeAiOauth":{"refreshToken":"b"}}');
    await writeFile(live.claudeProfile(), JSON.stringify(profile("clinic@office.in")));
    await accounts.capture("claude");

    await accounts.activate("claude", first);
    expect(await readFile(live.credentials("claude"), "utf8")).toContain('"a"');
    const settings = JSON.parse(await readFile(live.claudeProfile(), "utf8"));
    expect(settings.oauthAccount.emailAddress).toBe("ca@office.in");
    expect(settings.theme).toBe("light");
  });

  it("never saves one account's sign-in under another account", async () => {
    const accounts = store();
    await accounts.initialize();
    await writeFile(live.credentials("codex"), codexAuth("first@shop.in"));
    await accounts.capture("codex");
    const first = accounts.activeId("codex") as string;
    await accounts.beginAdd("codex");
    await writeFile(live.credentials("codex"), codexAuth("second@shop.in"));
    await accounts.capture("codex");
    const second = accounts.activeId("codex") as string;
    // Someone signs in to the first account by hand while the second is "in use".
    await writeFile(live.credentials("codex"), codexAuth("first@shop.in", "hand"));
    await accounts.activate("codex", first);
    await accounts.activate("codex", second);
    expect(codexSignInEmail(await readFile(live.credentials("codex"), "utf8"))).toBe(
      "second@shop.in",
    );
  });

  it("picks the next account that is not resting after a limit", async () => {
    const accounts = store();
    await accounts.initialize();
    for (const email of ["a@x.in", "b@x.in", "c@x.in"]) {
      if (accounts.activeId("codex")) await accounts.beginAdd("codex");
      await writeFile(live.credentials("codex"), codexAuth(email));
      await accounts.capture("codex");
    }
    const ids = accounts.list().providers.codex.accounts.map((account) => account.id);
    await accounts.activate("codex", ids[0] as string);
    expect(accounts.nextAccount("codex", new Set())).toBe(ids[1]);
    await accounts.activate("codex", ids[1] as string);
    await accounts.markLimited("codex");
    await accounts.activate("codex", ids[2] as string);
    // b is resting; after c comes a.
    expect(accounts.nextAccount("codex", new Set())).toBe(ids[0]);
    expect(accounts.nextAccount("codex", new Set([ids[0] as string]))).toBeNull();
    now += 2 * 60 * 60_000;
    expect(accounts.nextAccount("codex", new Set([ids[0] as string]))).toBe(ids[1]);
  });

  it("will not remove the account in use while others exist, and Disconnect forgets only it", async () => {
    const accounts = store();
    await accounts.initialize();
    await writeFile(live.credentials("codex"), codexAuth("a@x.in"));
    await accounts.capture("codex");
    await accounts.beginAdd("codex");
    await writeFile(live.credentials("codex"), codexAuth("b@x.in"));
    await accounts.capture("codex");
    const active = accounts.activeId("codex") as string;
    await expect(accounts.remove("codex", active)).rejects.toThrow(/in use/);
    await accounts.forgetActive("codex");
    expect(accounts.list().providers.codex.accounts.map((account) => account.email)).toEqual([
      "a@x.in",
    ]);
  });

  it("asks to connect first when there is no account to keep", async () => {
    const accounts = store();
    await accounts.initialize();
    await expect(accounts.beginAdd("claude")).rejects.toThrow(/Connect this AI first/);
  });
});
