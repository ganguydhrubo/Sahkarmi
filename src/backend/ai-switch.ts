import { basename, join } from "node:path";
import {
  type AgentProviderId,
  type ConversationMessage,
  PROVIDER_LABELS,
  type TurnPlan,
} from "../shared/ipc";
import { JsonFile } from "./json-file";
import { isRecord } from "./protocol";

/**
 * Moving a coworker from one AI to another (the owner picked another model, or the first AI ran
 * out of its limit) starts a fresh chat on the new AI. Without help the new AI knows nothing and
 * reads everything again. This module writes the short hand-over note the new AI gets with its
 * first message, keeps the earlier chat on the owner's screen, and picks the next AI from the
 * owner's backup order.
 */

const NOTE_MESSAGES = 16;
const NOTE_MESSAGE_CHARS = 600;
const NOTE_CHAT_CHARS = 5_000;
const NOTE_GOAL_CHARS = 900;
const NOTE_DONE_CHARS = 900;
const NOTE_FILES = 40;
const NOTE_FILES_MAX_AGE_MS = 7 * 24 * 3_600_000;
const NOTE_STEPS = 30;
const NOTE_STEP_CHARS = 160;
const NOTE_WORKING_NOTES = 6;
const NOTE_WORKING_NOTE_CHARS = 300;
const MAX_EARLIER_MESSAGES = 1_500;
const EARLIER_TEXT_CHARS = 20_000;
const EARLIER_TOOL_CHARS = 600;
/** How long an AI that reported a used-up limit is skipped when no reset time is known. */
export const DEFAULT_LIMIT_COOLDOWN_MS = 60 * 60_000;
/** A share of the plan limit at which the next AI is started quietly in the background. */
export const WARM_START_PERCENT = 85;

/** The short name an owner uses for each AI ("ChatGPT", not "ChatGPT (Codex)"). */
export function friendlyAiName(provider: AgentProviderId): string {
  if (provider === "codex") return "ChatGPT";
  if (provider === "antigravity") return "Gemini";
  if (provider === "opencode") return "the free AI";
  return PROVIDER_LABELS[provider];
}

function clip(text: string, limit: number): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

function spoken(message: ConversationMessage): boolean {
  return (
    (message.author === "user" || message.author === "assistant" || message.author === "agent") &&
    message.itemType !== "commentary" &&
    message.itemType !== "toolCall" &&
    !message.tool &&
    Boolean(message.text.trim())
  );
}

/** "[Continue]", "ok", "yes" and the like say nothing about the goal. */
function isSmallTalk(text: string): boolean {
  const flat = text.trim();
  return flat.startsWith("[") || flat.length < 12;
}

export interface SwitchNoteInput {
  messages: ConversationMessage[];
  from: AgentProviderId;
  to: AgentProviderId;
  /** Why the chat moved: the owner picked another AI, or the first one ran out of its limit. */
  reason: "owner" | "limit";
  /** The coworker's own task list when the old AI stopped, if it kept one. */
  plan?: TurnPlan | null;
  /** Files made or changed during this job, newest first (paths from the disk). */
  files?: string[];
}

/** The message that states the job: the owner's latest real request, not "ok" or "continue". */
export function goalMessage(messages: ConversationMessage[]): ConversationMessage | null {
  const fromOwner = messages.filter((message) => message.author === "user" && spoken(message));
  return (
    [...fromOwner].reverse().find((message) => !isSmallTalk(message.text)) ??
    fromOwner.at(-1) ??
    null
  );
}

/**
 * When the part of the chat the note covers began (ms since 1970): files made or changed after
 * this are listed for the new AI. At most a week back; null when the chat has no dated message.
 */
export function noteWindowStart(messages: ConversationMessage[], now = Date.now()): number | null {
  const said = messages.filter(spoken);
  const first = said.slice(-NOTE_MESSAGES)[0] ?? messages.find((message) => message.tool);
  const at = first ? Date.parse(first.createdAt) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(at, now - NOTE_FILES_MAX_AGE_MS);
}

/** One short line per tool step: what was used and on what. Never the tool's output. */
function stepLine(message: ConversationMessage): string | null {
  const tool = message.tool;
  if (!tool) return null;
  const on = tool.input ? `: ${clip(tool.input, NOTE_STEP_CHARS)}` : "";
  const ended =
    tool.status === "completed" ? "done" : tool.status === "failed" ? "failed" : "not finished";
  return `- ${tool.name}${on} (${ended})`;
}

/**
 * The hand-over note for the new AI: the goal, the plan with what is done, the steps already
 * taken, the files already made, the next step and the latest part of the chat. Most of a long
 * job is tool work, not chat, so the steps and files matter most: without them the new AI makes
 * everything again. Tool output is never included. Null when there is nothing to hand over.
 */
export function switchNote(input: SwitchNoteInput): string | null {
  const said = input.messages.filter(spoken);
  const worked = input.messages.filter((message) => message.tool);
  if (said.length === 0 && worked.length === 0) return null;
  const goal = goalMessage(input.messages);
  const replies = said.filter((message) => message.author === "assistant");
  const lastReply = replies.at(-1);
  const last = said.at(-1);

  // The latest tool steps and the coworker's own working notes: where most of a long job is.
  const steps = input.messages
    .map(stepLine)
    .filter((line): line is string => line !== null)
    .slice(-NOTE_STEPS);
  const workingNotes = input.messages
    .filter(
      (message) =>
        message.author === "assistant" && message.itemType === "commentary" && message.text.trim(),
    )
    .slice(-NOTE_WORKING_NOTES)
    .map((message) => `- ${clip(message.text, NOTE_WORKING_NOTE_CHARS)}`);

  const attached = input.messages
    .filter((message) => message.author === "assistant")
    .flatMap((message) => message.attachments ?? [])
    .map((item) => item.name);
  const onDisk = input.files ?? [];
  const known = new Set(onDisk.map((path) => basename(path.replaceAll("\\", "/"))));
  const files = [...onDisk, ...new Set(attached.filter((name) => !known.has(name)))].slice(
    0,
    NOTE_FILES,
  );

  const planSteps = input.plan?.steps ?? [];
  const openSteps = planSteps.filter((step) => step.status !== "completed");
  let next: string;
  if (openSteps.length > 0) {
    const current = openSteps.find((step) => step.status === "in_progress") ?? openSteps[0];
    next = `Carry on with the plan from this step: "${clip(current.text, 200)}". Part of it may already be done: check the steps and files below first, then finish only what is missing.`;
  } else if (last && last.author !== "assistant") {
    next = "The owner's latest message has no answer yet. Answer it, using the work already done.";
  } else {
    next = "Wait for what the owner asks next and continue from the last reply.";
  }

  const chat = said.slice(-NOTE_MESSAGES).map((message) => {
    const who =
      message.author === "assistant" ? "You" : message.author === "agent" ? "Teammate" : "Owner";
    return `${who}: ${clip(message.text, NOTE_MESSAGE_CHARS)}`;
  });
  let body = chat.join("\n");
  if (body.length > NOTE_CHAT_CHARS) body = `…${body.slice(-NOTE_CHAT_CHARS)}`;

  const why =
    input.reason === "limit"
      ? `${PROVIDER_LABELS[input.from]} could not carry on in the middle of this work (its usage limit is used up, or it stopped answering), so you (${PROVIDER_LABELS[input.to]}) are carrying it on.`
      : `The owner moved this coworker from ${PROVIDER_LABELS[input.from]} to you (${PROVIDER_LABELS[input.to]}).`;

  return [
    "[Hand-over note from Sahkarmi. This is not from the owner.]",
    `${why} This is a fresh chat for you, but it is the same coworker and the same job. The owner still sees the earlier messages. Carry on from where the work stopped: do not start again and do not ask the owner to repeat anything.`,
    "Before you make anything, look at what already exists: the files listed below, your work folder, and this coworker's browser pages, which are still open as they were left. Never generate, download or write again something that is already there; reuse it.",
    goal ? `Goal: ${clip(goal.text, NOTE_GOAL_CHARS)}` : null,
    planSteps.length > 0
      ? [
          "Plan so far:",
          ...planSteps.map(
            (step) =>
              `- [${step.status === "completed" ? "done" : step.status === "in_progress" ? "was being done" : "not started"}] ${clip(step.text, 200)}`,
          ),
        ].join("\n")
      : null,
    lastReply
      ? `Your last reply was: ${clip(lastReply.text, NOTE_DONE_CHARS)}`
      : "You had not replied to the owner yet.",
    steps.length > 0
      ? [`Steps already taken (the latest ${steps.length}, oldest first):`, ...steps].join("\n")
      : null,
    workingNotes.length > 0 ? ["Your own working notes:", ...workingNotes].join("\n") : null,
    files.length > 0
      ? [
          "Files already made or changed in this job (newest first):",
          ...files.map((file) => `- ${file}`),
        ].join("\n")
      : null,
    `Next step: ${next}`,
    body ? "--- latest part of the earlier chat ---" : null,
    body || null,
    body ? "--- end of the earlier chat ---" : null,
    "Do not mention this note or the change of AI unless the owner asks; use search_past_chats if you need more of the earlier chat.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A coworker went back to its own chat after another AI covered for it: what was said meanwhile,
 * so its own chat is not missing those messages.
 */
export function awayNote(
  messages: ConversationMessage[],
  covering: AgentProviderId,
): string | null {
  const said = messages.filter(spoken);
  if (!said.some((message) => message.author === "assistant")) return null;
  const chat = said.slice(-NOTE_MESSAGES).map((message) => {
    const who =
      message.author === "assistant"
        ? "The covering AI"
        : message.author === "agent"
          ? "Teammate"
          : "Owner";
    return `${who}: ${clip(message.text, NOTE_MESSAGE_CHARS)}`;
  });
  let body = chat.join("\n");
  if (body.length > NOTE_CHAT_CHARS) body = `…${body.slice(-NOTE_CHAT_CHARS)}`;
  return [
    "[Hand-over note from Sahkarmi. This is not from the owner.]",
    `While you were at your usage limit, ${PROVIDER_LABELS[covering]} covered for you in this same chat. The owner saw these messages; treat them as part of your chat and carry on from them:`,
    "--- while you were away ---",
    body,
    "--- end ---",
    "Do not mention this note unless the owner asks.",
  ].join("\n");
}

/** The note and the first message of the turn, as one text for the new AI. */
export function withHandover(note: string, text: string): string {
  return `${note}\n\n--- the message to answer now ---\n${text}`;
}

/* ------------------------------------------------------------------------------------------ */
/* The owner's backup order                                                                    */
/* ------------------------------------------------------------------------------------------ */

/**
 * The AI that takes over when `current` runs out: the next one in the owner's order that is
 * ready and not itself at its limit. The order wraps around, so with "ChatGPT, Gemini, free" a
 * Gemini coworker moves to the free AI and then to ChatGPT. Null when nothing can take over.
 */
export function nextBackup(
  order: readonly AgentProviderId[],
  current: AgentProviderId,
  usable: (provider: AgentProviderId) => boolean,
  tried: ReadonlySet<AgentProviderId> = new Set(),
): AgentProviderId | null {
  if (order.length === 0) return null;
  const at = order.indexOf(current);
  const rotated = at === -1 ? [...order] : [...order.slice(at + 1), ...order.slice(0, at)];
  return (
    rotated.find((provider) => provider !== current && !tried.has(provider) && usable(provider)) ??
    null
  );
}

/** Which AIs said "limit used up" lately, and until when each is skipped. */
export class LimitWatch {
  readonly #until = new Map<AgentProviderId, number>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** `resetsAt` (ms since 1970) when the AI said when its limit comes back. */
  mark(provider: AgentProviderId, resetsAt?: number | null): number {
    const now = this.#now();
    const until =
      typeof resetsAt === "number" && Number.isFinite(resetsAt) && resetsAt > now
        ? resetsAt
        : now + DEFAULT_LIMIT_COOLDOWN_MS;
    this.#until.set(provider, until);
    return until;
  }

  limited(provider: AgentProviderId): boolean {
    const until = this.#until.get(provider);
    if (until === undefined) return false;
    if (until > this.#now()) return true;
    this.#until.delete(provider);
    return false;
  }

  until(provider: AgentProviderId): number | null {
    return this.limited(provider) ? (this.#until.get(provider) ?? null) : null;
  }

  clear(provider: AgentProviderId): void {
    this.#until.delete(provider);
  }
}

const RESET_SPAN =
  /\b(?:resets?|try again|available|retry)\b[^.\n]{0,40}?\bin\s+((?:\d+\s*(?:hours?|h|min(?:ute)?s?|m|sec(?:ond)?s?|s)\s*)+)/i;
const RESET_PART = /(\d+)\s*(hours?|h|min(?:ute)?s?|m|sec(?:ond)?s?|s)/gi;
/** "try again at 8:22 PM" (ChatGPT's wording): a clock time, today or else tomorrow. */
const RESET_CLOCK =
  /\b(?:resets?|try again|available|retry)\b[^.\n]{0,40}?\bat\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i;
/** A plan or quota that is used up, as opposed to "too many requests this minute". */
const PLAN_LIMIT =
  /usage limit|quota|RESOURCE_EXHAUSTED|credit balance|out of (?:credits|extra usage)|hit your (?:usage )?limit|plan limit/i;
/** A brief "slow down" (HTTP 429 with no plan words) is over in minutes, not hours. */
const SHORT_LIMIT_COOLDOWN_MS = 10 * 60_000;
const MAX_LIMIT_COOLDOWN_MS = 7 * 24 * 3_600_000;

/**
 * When the AI that reported `text` can be tried again (ms since 1970): the time it said itself
 * ("resets in 9h54m20s", "try again in 35 minutes"), else an hour for a used-up plan and ten
 * minutes for a brief rate limit.
 */
export function limitResetFromText(text: string, now = Date.now()): number {
  const span = RESET_SPAN.exec(text);
  if (span) {
    let ms = 0;
    for (const part of span[1].matchAll(RESET_PART)) {
      const amount = Number(part[1]);
      const unit = part[2].toLowerCase();
      ms += unit.startsWith("h")
        ? amount * 3_600_000
        : unit.startsWith("m")
          ? amount * 60_000
          : amount * 1_000;
    }
    if (ms > 0) return now + Math.min(ms, MAX_LIMIT_COOLDOWN_MS);
  }
  const clock = RESET_CLOCK.exec(text);
  if (clock) {
    const hour12 = Number(clock[1]) % 12;
    const hour = clock[3].toUpperCase() === "PM" ? hour12 + 12 : hour12;
    const at = new Date(now);
    at.setHours(hour, Number(clock[2] ?? 0), 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return at.getTime();
  }
  return now + (PLAN_LIMIT.test(text) ? DEFAULT_LIMIT_COOLDOWN_MS : SHORT_LIMIT_COOLDOWN_MS);
}

/* ------------------------------------------------------------------------------------------ */
/* What is kept on disk                                                                        */
/* ------------------------------------------------------------------------------------------ */

export interface PendingHandover {
  note: string;
  from: AgentProviderId;
  to: AgentProviderId;
  at: string;
}

export interface EarlierMessage {
  /** The chat (on the earlier AI) this message was said in. */
  threadId: string;
  message: ConversationMessage;
}

/** A coworker working on a backup AI: its own model and chat, to go back to when the limit ends. */
export interface CoverRecord {
  model: string;
  reasoningEffort: string;
  threadId: string | null;
  /** The model that covers for it. A model the owner picked meanwhile wins. */
  coveringModel: string;
  since: string;
  stayUntil: number;
}

interface SwitchState {
  pending: Record<string, PendingHandover>;
  earlier: Record<string, EarlierMessage[]>;
  covers?: Record<string, CoverRecord>;
}

function isState(value: unknown): value is SwitchState {
  return (
    isRecord(value) &&
    isRecord(value.pending) &&
    isRecord(value.earlier) &&
    (value.covers === undefined || isRecord(value.covers))
  );
}

/** A copy small enough to keep: long tool output and thinking are cut, live flags dropped. */
function keepable(message: ConversationMessage, id: string): ConversationMessage {
  const copy: ConversationMessage = {
    id,
    turnId: message.turnId,
    author: message.author,
    text:
      message.text.length > EARLIER_TEXT_CHARS
        ? `${message.text.slice(0, EARLIER_TEXT_CHARS)}…`
        : message.text,
    createdAt: message.createdAt,
    status: message.status === "streaming" ? "interrupted" : message.status,
  };
  if (message.itemType) copy.itemType = message.itemType;
  if (message.source) copy.source = message.source;
  if (message.senderBotId) copy.senderBotId = message.senderBotId;
  if (message.attachments?.length) copy.attachments = message.attachments;
  if (message.citations?.length) copy.citations = message.citations;
  if (message.tool) {
    const cut = (value: string | null) =>
      value && value.length > EARLIER_TOOL_CHARS ? `${value.slice(0, EARLIER_TOOL_CHARS)}…` : value;
    copy.tool = {
      ...message.tool,
      status: message.tool.status === "running" ? "failed" : message.tool.status,
      input: cut(message.tool.input),
      output: cut(message.tool.output),
    };
  }
  return copy;
}

/**
 * <userData>/ai-switch.json: the hand-over note each coworker's next AI still has to receive, and
 * the earlier chat that stays on the owner's screen after a move. Read once, then from memory.
 */
export class AiSwitchStore {
  readonly #file: JsonFile<SwitchState>;
  #state: SwitchState = { pending: {}, earlier: {} };
  #loaded: Promise<void> | null = null;
  #writes: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.#file = new JsonFile<SwitchState>(join(userDataPath, "ai-switch.json"));
  }

  load(): Promise<void> {
    this.#loaded ??= this.#file
      .read(() => ({ pending: {}, earlier: {} }), isState)
      .then((state) => {
        this.#state = state;
      })
      .catch(() => undefined);
    return this.#loaded;
  }

  #save(): Promise<void> {
    const snapshot = structuredClone(this.#state);
    this.#writes = this.#writes.then(() => this.#file.write(snapshot)).catch(() => undefined);
    return this.#writes;
  }

  pending(botId: string): PendingHandover | null {
    return this.#state.pending[botId] ?? null;
  }

  async setPending(botId: string, handover: PendingHandover | null): Promise<void> {
    await this.load();
    if (handover) this.#state.pending[botId] = handover;
    else if (botId in this.#state.pending) delete this.#state.pending[botId];
    else return;
    await this.#save();
  }

  /** The earlier chats' messages, oldest first. The array is the store's own: do not change it. */
  earlier(botId: string): readonly EarlierMessage[] {
    return this.#state.earlier[botId] ?? EMPTY;
  }

  /**
   * Keeps what is on screen now, before the coworker's chat moves to another AI. Messages the
   * mailbox owns (the owner's own messages, teammates' notes) are not copied: the mailbox still
   * shows them. Ids get the old chat's id in front, so they can never clash with the new chat's.
   */
  async remember(
    botId: string,
    threadId: string | null,
    messages: ConversationMessage[],
  ): Promise<void> {
    await this.load();
    const kept = [...(this.#state.earlier[botId] ?? [])];
    const have = new Set(kept.map((item) => item.message.id));
    let added = false;
    if (threadId) {
      for (const message of messages) {
        if (message.delivery || message.exchange) continue;
        if (have.has(message.id)) continue;
        if (!message.text.trim() && !message.tool && !message.attachments?.length) continue;
        const id = `${threadId}:${message.id}`;
        if (have.has(id)) continue;
        have.add(id);
        kept.push({ threadId, message: keepable(message, id) });
        added = true;
      }
    }
    if (!added) return;
    this.#state.earlier[botId] = kept.slice(-MAX_EARLIER_MESSAGES);
    await this.#save();
  }

  /** Back on this chat, its own history shows these messages; the kept copies would be doubles. */
  async dropThread(botId: string, threadId: string): Promise<void> {
    await this.load();
    const kept = this.#state.earlier[botId];
    if (!kept?.some((item) => item.threadId === threadId)) return;
    this.#state.earlier[botId] = kept.filter((item) => item.threadId !== threadId);
    await this.#save();
  }

  covers(): Readonly<Record<string, CoverRecord>> {
    return this.#state.covers ?? {};
  }

  async setCover(botId: string, cover: CoverRecord | null): Promise<void> {
    await this.load();
    const covers = { ...(this.#state.covers ?? {}) };
    if (cover) covers[botId] = cover;
    else if (botId in covers) delete covers[botId];
    else return;
    this.#state.covers = covers;
    await this.#save();
  }

  async forget(botId: string): Promise<void> {
    await this.load();
    if (
      !(botId in this.#state.pending) &&
      !(botId in this.#state.earlier) &&
      !(botId in (this.#state.covers ?? {}))
    ) {
      return;
    }
    delete this.#state.pending[botId];
    delete this.#state.earlier[botId];
    if (this.#state.covers) delete this.#state.covers[botId];
    await this.#save();
  }
}

const EMPTY: readonly EarlierMessage[] = [];
