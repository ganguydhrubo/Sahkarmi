import type { HomeRunner } from "./home-understand";
import { HOME_BACKUP_MODELS } from "./home-understand";

/**
 * A side question: while a coworker is busy with a job, the owner asks something quick. A free
 * AI answers it from the chat so far, in a run of its own, so the coworker's job is not touched,
 * not slowed and not confused. The answer is a helper's answer: it does not see the coworker's
 * files or tools, and it says so when the job's result is not there yet.
 */
export interface SideQuestionInput {
  question: string;
  coworkerName: string;
  coworkerRole: string;
  /** The job the coworker is doing now, in the owner's words. */
  job: string;
  /** The last messages of the chat, oldest first. */
  recent: Array<{ from: "owner" | "coworker"; text: string }>;
  /** The app language in English ("Bengali"). */
  language: string;
}

const MAX_QUESTION = 1_000;
const MAX_JOB = 1_200;
const MAX_RECENT = 8;
const MAX_MESSAGE = 700;
const MAX_ANSWER = 1_500;
/** One model's time to answer; a quick free model takes 7-13 s through OpenCode. */
const MODEL_TIMEOUT_MS = 25_000;
const MAX_MODELS_TRIED = 2;

/** A long message is shown shortened, and marked so, or the AI thinks the coworker stopped mid-way. */
function shortened(text: string): string {
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)} [… shortened here]` : text;
}

export function sideQuestionPrompt(input: SideQuestionInput): string {
  const recent = input.recent
    .slice(-MAX_RECENT)
    .map(
      (message) =>
        `${message.from === "owner" ? "Owner" : input.coworkerName}: ${shortened(message.text)}`,
    );
  return [
    "Reply with plain text only: no headings, no code fence. Do not use any tool.",
    `The owner of a small business is waiting while their AI coworker ${input.coworkerName}${input.coworkerRole ? ` (${input.coworkerRole})` : ""} is busy with a job. The owner asks you a quick side question.`,
    `Answer in at most 90 words, in simple words, in the language the owner wrote in${input.language ? ` (when that is not clear, in ${input.language})` : ""}.`,
    "Use the chat below when it helps. You cannot see the coworker's files, screen or tools. If the answer depends on the job's result, say plainly that the coworker is still working on it. Never make up facts, prices, names or dates.",
    input.job ? `--- the job the coworker is doing now ---\n${input.job.slice(0, MAX_JOB)}` : "",
    recent.length > 0 ? `--- the chat so far ---\n${recent.join("\n")}` : "",
    "--- the owner's side question ---",
    input.question.slice(0, MAX_QUESTION),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Terminal colour codes OpenCode may print around the answer. */
const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** The model's words, tidied. Null when there is nothing usable. */
export function tidyAnswer(raw: string): string | null {
  const text = raw
    .replace(ANSI_COLOUR, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, MAX_ANSWER) : null;
}

/** Null on any failure or when overtaken by a newer question. Never throws. */
export async function answerSideQuestion(
  input: SideQuestionInput,
  run: HomeRunner,
  options: { models?: string[]; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!input.question.trim()) return null;
  const models = (options.models?.length ? options.models : HOME_BACKUP_MODELS).slice(
    0,
    MAX_MODELS_TRIED,
  );
  const prompt = sideQuestionPrompt(input);
  for (const model of models) {
    if (options.signal?.aborted) return null;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? MODEL_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      const answer = tidyAnswer(await run(model, prompt, signal));
      if (answer) return answer;
    } catch {
      // This model failed or was too slow: the next one may still answer.
    }
  }
  return null;
}

/** What the free AI is told about the chat when it suggests the owner's next message. */
export interface NextMessageInput {
  coworkerName: string;
  coworkerRole: string;
  recent: Array<{ from: "owner" | "coworker"; text: string }>;
  language: string;
}

const MAX_SUGGESTION = 120;

export function nextMessagePrompt(input: NextMessageInput): string {
  const recent = input.recent
    .slice(-MAX_RECENT)
    .map(
      (message) =>
        `${message.from === "owner" ? "Owner" : input.coworkerName}: ${shortened(message.text)}`,
    );
  return [
    "Reply with plain text only, on one line. Do not use any tool.",
    `A small-business owner is talking to their AI coworker ${input.coworkerName}${input.coworkerRole ? ` (${input.coworkerRole})` : ""}. The coworker has just answered.`,
    `Write the ONE message the owner would most likely want to send next, as the owner would type it: at most 12 words, no quotes, in the language the owner wrote in${input.language ? ` (when that is not clear, in ${input.language})` : ""}.`,
    "It must be a useful next step for the work in the chat (approve, change something, ask for the next part), never small talk. If no useful next step is clear, reply with the single word NONE.",
    "A message marked [… shortened here] is complete in the real chat; it was only shortened for you. Never say that something was cut off.",
    `--- the chat so far ---\n${recent.join("\n")}`,
  ].join("\n");
}

/** One short line the owner can accept, or null when the reply is not usable. */
export function tidySuggestion(raw: string): string | null {
  const text = tidyAnswer(raw);
  if (!text) return null;
  const line = (text.split("\n").find((part) => part.trim()) ?? "")
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();
  if (!line || /^none[.!]?$/i.test(line)) return null;
  // A long answer is the AI talking, not a message to send.
  if (line.length > MAX_SUGGESTION || line.split(/\s+/).length > 20) return null;
  return line;
}

/** Null on any failure, when nothing useful is clear, or when overtaken. Never throws. */
export async function suggestNextMessage(
  input: NextMessageInput,
  run: HomeRunner,
  options: { models?: string[]; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!input.recent.some((message) => message.from === "coworker" && message.text.trim())) {
    return null;
  }
  // One model only: a suggestion that comes late is worth nothing.
  const model = (options.models?.length ? options.models : HOME_BACKUP_MODELS)[0];
  if (!model || options.signal?.aborted) return null;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? MODEL_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return tidySuggestion(await run(model, nextMessagePrompt(input), signal));
  } catch {
    return null;
  }
}
