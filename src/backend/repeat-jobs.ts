import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ConversationMessage, MessageOrigin } from "../shared/ipc";
import { JsonFile } from "./json-file";
import { isRecord } from "./protocol";

/**
 * A job that runs again and again (a daily schedule, a routine) should get cheaper, not dearer.
 * Left alone, every run is added to the coworker's one long chat, so run 12 reads runs 1 to 11
 * again with every step, and the coworker works out the same route afresh each day.
 *
 * This module remembers each repeated job: the route that worked (the tool steps of the last
 * good run), the files it made and the latest results. From the second run on, the job starts in
 * a clean chat with that short note, so the model reads a few hundred words instead of days of
 * old work. Nothing here calls a model: the note is built from what the run itself did.
 */

const ROUTE_STEPS = 25;
const ROUTE_STEP_CHARS = 160;
const RECENT_RESULTS = 5;
const RESULT_CHARS = 280;
const FILES_KEPT = 8;
const HISTORY_KEPT = 60;
const MAX_JOBS = 300;

export interface RepeatJobRef {
  /** Stable for the same job of the same coworker, whatever the day. */
  key: string;
  title: string;
  /** 1-based step of a routine; 1 for a schedule. */
  step: number;
  totalSteps: number;
}

const ROUTINE_HEADER = /^\[Routine "(.+?)" · step (\d+)\/(\d+)(?: · yes\/no check)?\]\s*/;
const SCHEDULE_HEADER = /^\[Scheduled task\]\s*/;

/** The repeated job a queued message belongs to, or null for ordinary messages. */
export function repeatJobOf(delivery: {
  origin?: MessageOrigin | null;
  text: string;
  recipientBotId: string;
}): RepeatJobRef | null {
  if (delivery.origin === "routine") {
    const header = ROUTINE_HEADER.exec(delivery.text);
    if (!header) return null;
    return {
      key: `routine:${delivery.recipientBotId}:${header[1]}`,
      title: header[1],
      step: Number(header[2]),
      totalSteps: Number(header[3]),
    };
  }
  if (delivery.origin === "schedule" && SCHEDULE_HEADER.test(delivery.text)) {
    const task = delivery.text.replace(SCHEDULE_HEADER, "").trim();
    if (!task) return null;
    const digest = createHash("sha256")
      .update(task.toLowerCase().replace(/\s+/g, " "))
      .digest("hex")
      .slice(0, 16);
    return {
      key: `schedule:${delivery.recipientBotId}:${digest}`,
      title: task.length > 80 ? `${task.slice(0, 80)}…` : task,
      step: 1,
      totalSteps: 1,
    };
  }
  return null;
}

/** What one step of a repeated job did the last time it went well. */
export interface StepMemory {
  route: string[];
  files: string[];
  /** The latest results, newest last, so today's work can differ from them. */
  recent: string[];
}

export interface RepeatRun {
  at: string;
  /** Tokens the AI reported for the run, when it reports them (ChatGPT does). */
  tokens: number | null;
  /** True when the run started in a clean chat with the saved route. */
  lean: boolean;
  ok: boolean;
}

export interface RepeatJob {
  key: string;
  title: string;
  /** Runs that finished well. */
  runs: number;
  lastRunAt: string;
  steps: Record<string, StepMemory>;
  history: RepeatRun[];
}

function clip(text: string, limit: number): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** The route of a finished turn: one line per tool step, in order. Never a tool's output. */
export function routeOf(messages: ConversationMessage[], turnId: string): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.turnId !== turnId || !message.tool) continue;
    if (message.tool.status !== "completed") continue;
    const on = message.tool.input ? `: ${clip(message.tool.input, ROUTE_STEP_CHARS)}` : "";
    const line = `${message.tool.name}${on}`;
    // The same step many times in a row (scrolling, waiting) is one line of the route.
    if (lines.at(-1) !== line) lines.push(line);
  }
  return lines.slice(-ROUTE_STEPS);
}

export interface RepeatNoteInput {
  job: RepeatJob;
  ref: RepeatJobRef;
  /** True when this run starts in a clean chat. */
  cleanChat: boolean;
}

/**
 * The short note a repeated job starts with: how many times it was done, the route that worked,
 * the files it made and the latest results. Null when nothing useful is known yet.
 */
export function repeatNote(input: RepeatNoteInput): string | null {
  const memory = input.job.steps[String(input.ref.step)];
  if (input.job.runs < 1 || !memory) return null;
  const times = input.job.runs === 1 ? "once" : `${input.job.runs} times`;
  return [
    "[Note from Sahkarmi about a repeated job. This is not from the owner.]",
    `You have done this same job ${times} before.${
      input.cleanChat
        ? " This is a clean chat so that the old runs are not read again; the owner still sees them, and search_past_chats finds them if you need one."
        : ""
    }`,
    memory.route.length > 0
      ? [
          "The route that worked last time. Follow it, do not explore again, and look at a page again only when a step does not go as expected:",
          ...memory.route.map((line) => `- ${line}`),
        ].join("\n")
      : null,
    memory.files.length > 0 ? `Files made last time: ${memory.files.join(", ")}` : null,
    memory.recent.length > 0
      ? [
          "Results of the latest runs, newest last. Today's work must be new; do not repeat these:",
          ...memory.recent.map((line) => `- ${line}`),
        ].join("\n")
      : null,
    "For this job skip list_skills and save_skill: the route above is your saved skill. Do the job for today and reply in a few lines: what was done, and the file or link.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The note and the job's own message, as one text for the AI. */
export function withRepeatNote(note: string, text: string): string {
  return `${note}\n\n--- the job to do now ---\n${text}`;
}

/** How the latest lean run compares with the first run that reported tokens, in percent. */
export function repeatSaving(
  job: RepeatJob,
): { first: number; latest: number; percent: number } | null {
  const measured = job.history.filter((run) => run.ok && typeof run.tokens === "number");
  const first = measured.find((run) => !run.lean)?.tokens;
  const latest = [...measured].reverse().find((run) => run.lean)?.tokens;
  if (!first || !latest) return null;
  return { first, latest, percent: Math.round((latest / first) * 100) };
}

interface RepeatState {
  jobs: Record<string, RepeatJob>;
}

function isState(value: unknown): value is RepeatState {
  return isRecord(value) && isRecord(value.jobs);
}

/** <userData>/repeat-jobs.json. Read once, then from memory. */
export class RepeatJobStore {
  readonly #file: JsonFile<RepeatState>;
  #state: RepeatState = { jobs: {} };
  #loaded: Promise<void> | null = null;

  constructor(userDataPath: string) {
    this.#file = new JsonFile<RepeatState>(join(userDataPath, "repeat-jobs.json"));
  }

  load(): Promise<void> {
    this.#loaded ??= this.#file
      .read(() => ({ jobs: {} }), isState)
      .then((state) => {
        this.#state = state;
      })
      .catch(() => undefined);
    return this.#loaded;
  }

  get(key: string): RepeatJob | null {
    return this.#state.jobs[key] ?? null;
  }

  list(): RepeatJob[] {
    return Object.values(this.#state.jobs);
  }

  /** Records one finished step of a run; a failed one only goes into the history. */
  async record(
    ref: RepeatJobRef,
    run: {
      ok: boolean;
      lean: boolean;
      tokens: number | null;
      route: string[];
      files: string[];
      result: string;
    },
  ): Promise<RepeatJob> {
    await this.load();
    const now = new Date().toISOString();
    const job: RepeatJob = this.#state.jobs[ref.key] ?? {
      key: ref.key,
      title: ref.title,
      runs: 0,
      lastRunAt: now,
      steps: {},
      history: [],
    };
    job.title = ref.title;
    job.history = [
      ...job.history,
      { at: now, tokens: run.tokens, lean: run.lean, ok: run.ok },
    ].slice(-HISTORY_KEPT);
    if (run.ok) {
      // A routine's run counts once, when its last step is done.
      if (ref.step >= ref.totalSteps) job.runs += 1;
      job.lastRunAt = now;
      const before = job.steps[String(ref.step)];
      const result = clip(run.result, RESULT_CHARS);
      job.steps[String(ref.step)] = {
        // A run that only repeated the saved route by heart may show fewer steps: keep the
        // fuller route unless the new one is a real route of its own.
        route: run.route.length > 0 ? run.route : (before?.route ?? []),
        files: run.files.length > 0 ? run.files.slice(0, FILES_KEPT) : (before?.files ?? []),
        recent: result
          ? [...(before?.recent ?? []), result].slice(-RECENT_RESULTS)
          : (before?.recent ?? []),
      };
    }
    this.#state.jobs[ref.key] = job;
    const keys = Object.keys(this.#state.jobs);
    if (keys.length > MAX_JOBS) {
      keys
        .sort((left, right) =>
          (this.#state.jobs[left]?.lastRunAt ?? "").localeCompare(
            this.#state.jobs[right]?.lastRunAt ?? "",
          ),
        )
        .slice(0, keys.length - MAX_JOBS)
        .forEach((key) => {
          delete this.#state.jobs[key];
        });
    }
    await this.#file.write(structuredClone(this.#state)).catch(() => undefined);
    return job;
  }

  async forgetBot(botId: string): Promise<void> {
    await this.load();
    let changed = false;
    for (const key of Object.keys(this.#state.jobs)) {
      if (key.startsWith(`routine:${botId}:`) || key.startsWith(`schedule:${botId}:`)) {
        delete this.#state.jobs[key];
        changed = true;
      }
    }
    if (changed) await this.#file.write(structuredClone(this.#state)).catch(() => undefined);
  }
}
