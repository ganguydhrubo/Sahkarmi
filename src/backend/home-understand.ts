import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HomeTeamMember, HomeUnderstanding } from "../shared/ipc";

export type { HomeTeamMember, HomeUnderstanding };

/**
 * Home's AI preview: the owner types a job, and before Start is pressed a free model says what
 * it understood, who should do it and what is missing.
 *
 * The free models answer only through OpenCode itself (a direct call to OpenCode's server is
 * refused with "free usage limit"), so each read is one short `opencode run` with every tool
 * denied. It is a helper, never a gate: any failure returns null and Home works as before.
 */
/** Runs one prompt on one model and returns the model's words. Rejects on any failure. */
export type HomeRunner = (model: string, prompt: string, signal: AbortSignal) => Promise<string>;

/** Quick free models, used when OpenCode's own list cannot be read. */
export const HOME_BACKUP_MODELS = [
  "opencode/hy4-flash-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/nemotron-3.5-lightning-free",
];

const MAX_JOB_LETTERS = 2_000;
const MAX_TEAM = 30;
/** One model's time to answer; a quick free model takes 7-13 s through OpenCode. */
const MODEL_TIMEOUT_MS = 20_000;
/** A second model is tried only when the first one failed; more would make the owner wait. */
const MAX_MODELS_TRIED = 2;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function clipList(value: unknown, count: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clip(item, max))
    .filter(Boolean)
    .slice(0, count);
}

export function homePrompt(text: string, team: HomeTeamMember[], language: string): string {
  const list = team.slice(0, MAX_TEAM).map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    state: member.busy ? "busy" : "idle",
  }));
  return [
    "Reply with JSON only. No other words, no code fence. Do not use any tool.",
    "A small-business owner typed the job below. The words may be short, misspelt or in mixed languages.",
    `Write "understood", "why", "questions" and "plan" in the language the owner wrote in${language ? ` (when that is not clear, in ${language})` : ""}, in simple words.`,
    "Reply exactly in this shape:",
    '{"understood": string (one short line: the job in plain words), "coworkerIds": string[] (ids from the team, the best one first, usually only one), "why": string (one short line: why that coworker), "questions": string[] (at most 3 short questions, only for things you cannot sensibly guess; empty when nothing is missing), "plan": string[] (at most 4 short steps)}',
    "Never make up facts, prices, names or dates.",
    `Team: ${JSON.stringify(list)}`,
    "--- the owner's words ---",
    text.slice(0, MAX_JOB_LETTERS),
  ].join("\n");
}

/** Reads the model's reply. Null when it is not usable; never throws. */
export function parseUnderstanding(raw: string, team: HomeTeamMember[]): HomeUnderstanding | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const reply = value as Record<string, unknown>;
  const understood = clip(reply.understood, 240);
  if (!understood) return null;
  const known = new Set(team.map((member) => member.id));
  const ids = Array.isArray(reply.coworkerIds) ? reply.coworkerIds : [];
  return {
    understood,
    coworkerIds: [
      ...new Set(ids.filter((id): id is string => typeof id === "string" && known.has(id))),
    ].slice(0, 3),
    why: clip(reply.why, 240),
    questions: clipList(reply.questions, 3, 160),
    plan: clipList(reply.plan, 4, 160),
  };
}

/** Quick models first: the owner is waiting on the Home screen. */
export function orderHomeModels(models: string[]): string[] {
  const free = models.filter((model) => model.startsWith("opencode/") && model.endsWith("-free"));
  const quick = free.filter((model) => /flash|lightning|fast|mini|nano/i.test(model));
  return [...quick, ...free.filter((model) => !quick.includes(model))];
}

export async function understandJob(
  text: string,
  team: HomeTeamMember[],
  run: HomeRunner,
  options: { models?: string[]; language?: string; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<HomeUnderstanding | null> {
  const job = text.trim();
  if (!job || team.length === 0) return null;
  const models = (options.models?.length ? options.models : HOME_BACKUP_MODELS).slice(
    0,
    MAX_MODELS_TRIED,
  );
  const prompt = homePrompt(job, team, options.language ?? "");
  for (const model of models) {
    if (options.signal?.aborted) return null;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? MODEL_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const result = parseUnderstanding(await run(model, prompt, signal), team);
      if (result) return result;
    } catch {
      // This model failed or was too slow: the next one may still answer.
    }
  }
  return null;
}

/** No edits, no commands, no web: the reader only reads the owner's words. */
const READ_ONLY = JSON.stringify({
  edit: "deny",
  bash: "deny",
  webfetch: "deny",
  external_directory: "deny",
});

function runOpenCode(executable: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const folder = join(tmpdir(), "sahkarmi-home-reader");
    mkdirSync(folder, { recursive: true });
    const child = spawn(executable, args, {
      cwd: folder,
      env: { ...process.env, OPENCODE_PERMISSION: READ_ONLY },
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
      signal,
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (out.length < 200_000) out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`OpenCode stopped with code ${code}.`)),
    );
  });
}

/** The real runner: one short OpenCode run per read, with every tool denied. */
export function openCodeHomeRunner(executable: string): HomeRunner {
  return (model, prompt, signal) =>
    runOpenCode(
      executable,
      ["run", "--pure", "--title", "Sahkarmi Home preview", "-m", model, prompt],
      signal,
    );
}

/** OpenCode's free models right now, quick ones first. Empty when the list cannot be read. */
export async function listHomeModels(executable: string): Promise<string[]> {
  try {
    const out = await runOpenCode(executable, ["models", "opencode"], AbortSignal.timeout(10_000));
    return orderHomeModels(out.split(/\s+/).filter(Boolean));
  } catch {
    return [];
  }
}
