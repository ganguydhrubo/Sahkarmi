import { join } from "node:path";
import type { ConversationMessage } from "../shared/ipc";
import { JsonFile } from "./json-file";

/**
 * Messages the owner removed from a chat, and chats the owner cleared.
 *
 * Nothing is deleted from the AI's own history files or from the mailbox: other parts of
 * Sahkarmi rely on those records (resuming a chat, replies, retries). The messages are only
 * left out when the chat is shown. So a removal can never break a chat, and it stays reversible.
 */
interface HiddenState {
  /** botId -> time (ISO): every message made before it is left out ("Clear this chat"). */
  cleared: Record<string, string>;
  /** botId -> removed messages. */
  hidden: Record<string, HiddenMessage[]>;
}

interface HiddenMessage {
  id: string;
  /** The same message can come back with a new id after a restart; this still matches it. */
  mark: string;
}

/** One coworker's removals are capped so the file cannot grow without end. */
const MAX_HIDDEN_PER_BOT = 2_000;

function isState(value: unknown): value is HiddenState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<HiddenState>;
  return (
    typeof state.cleared === "object" &&
    state.cleared !== null &&
    typeof state.hidden === "object" &&
    state.hidden !== null
  );
}

/** Who said it, in which turn, and how it starts: enough to know the message again. */
export function messageMark(
  message: Pick<ConversationMessage, "turnId" | "author" | "text">,
): string {
  return `${message.turnId ?? ""}|${message.author}|${message.text.slice(0, 160)}`;
}

export class HiddenMessageStore {
  readonly #file: JsonFile<HiddenState>;
  #state: HiddenState = { cleared: {}, hidden: {} };
  #loaded: Promise<void> | null = null;
  #writes: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.#file = new JsonFile<HiddenState>(join(userDataPath, "hidden-messages.json"));
  }

  load(): Promise<void> {
    this.#loaded ??= this.#file
      .read(() => ({ cleared: {}, hidden: {} }), isState)
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

  /** True when the owner removed something from this coworker's chat (a quick way out). */
  has(botId: string): boolean {
    return botId in this.#state.cleared || (this.#state.hidden[botId]?.length ?? 0) > 0;
  }

  async hide(botId: string, message: ConversationMessage): Promise<void> {
    await this.load();
    const list = this.#state.hidden[botId] ?? [];
    if (list.some((item) => item.id === message.id)) return;
    list.push({ id: message.id, mark: messageMark(message) });
    this.#state.hidden[botId] = list.slice(-MAX_HIDDEN_PER_BOT);
    await this.#save();
  }

  /** Everything said before `at` is left out; single removals before it are no longer needed. */
  async clearChat(botId: string, at: string): Promise<void> {
    await this.load();
    this.#state.cleared[botId] = at;
    delete this.#state.hidden[botId];
    await this.#save();
  }

  async forget(botId: string): Promise<void> {
    await this.load();
    if (!this.has(botId)) return;
    delete this.#state.cleared[botId];
    delete this.#state.hidden[botId];
    await this.#save();
  }

  /** The messages still to show. Returns the same array when nothing is left out. */
  visible(botId: string, messages: ConversationMessage[]): ConversationMessage[] {
    if (!this.has(botId)) return messages;
    const cutoff = Date.parse(this.#state.cleared[botId] ?? "");
    const list = this.#state.hidden[botId] ?? [];
    const ids = new Set(list.map((item) => item.id));
    const marks = new Set(list.map((item) => item.mark));
    const kept = messages.filter((message) => {
      if (Number.isFinite(cutoff)) {
        const made = Date.parse(message.createdAt);
        if (Number.isFinite(made) && made < cutoff) return false;
      }
      return !ids.has(message.id) && !marks.has(messageMark(message));
    });
    return kept.length === messages.length ? messages : kept;
  }
}
