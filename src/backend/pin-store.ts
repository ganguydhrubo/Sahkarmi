import { join } from "node:path";
import type { PinnedMessage } from "../shared/ipc";
import { JsonFile } from "./json-file";
import { isRecord } from "./protocol";

/** Pins a chat keeps; the oldest goes when a new one would pass this. */
export const MAX_PINS_PER_CHAT = 20;
/** A pin keeps the message text so it can be read and copied from the bar. */
export const PIN_TEXT_CHARS = 6_000;

interface PinsFile {
  version: 1;
  pins: PinnedMessage[];
}

/**
 * Messages the owner pinned in a chat (the final price list, the bill, the address), shown in a
 * bar above the chat so they are one tap away however long the chat grows.
 */
export class PinStore {
  readonly #file: JsonFile<PinsFile>;
  readonly #now: () => Date;
  #state: PinsFile = { version: 1, pins: [] };

  constructor(userDataPath: string, now: () => Date = () => new Date()) {
    this.#file = new JsonFile(join(userDataPath, "pins.json"), { recoverCorrupt: true });
    this.#now = now;
  }

  async initialize(): Promise<void> {
    this.#state = await this.#file.read(() => ({ version: 1, pins: [] }), isPinsFile);
  }

  /** Newest first. */
  list(botId: string): PinnedMessage[] {
    return this.#state.pins
      .filter((pin) => pin.botId === botId)
      .sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt))
      .map((pin) => ({ ...pin }));
  }

  /** Pins the message, or unpins it when it is pinned already. Returns the chat's pins. */
  async toggle(input: {
    botId: string;
    messageId: string;
    text: string;
  }): Promise<PinnedMessage[]> {
    const { botId, messageId } = input;
    const at = this.#state.pins.findIndex(
      (pin) => pin.botId === botId && pin.messageId === messageId,
    );
    if (at >= 0) {
      this.#state.pins.splice(at, 1);
    } else {
      const text = input.text.trim().slice(0, PIN_TEXT_CHARS);
      if (!text) throw new Error("This message has no text to pin.");
      this.#state.pins.push({ botId, messageId, text, pinnedAt: this.#now().toISOString() });
      const chat = this.list(botId);
      for (const old of chat.slice(MAX_PINS_PER_CHAT)) {
        this.#state.pins = this.#state.pins.filter(
          (pin) => !(pin.botId === botId && pin.messageId === old.messageId),
        );
      }
    }
    await this.#file.write(this.#state);
    return this.list(botId);
  }

  async deleteBotData(botId: string): Promise<void> {
    this.#state.pins = this.#state.pins.filter((pin) => pin.botId !== botId);
    await this.#file.write(this.#state);
  }
}

function isPinsFile(value: unknown): value is PinsFile {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.pins) &&
    value.pins.every(
      (pin) =>
        isRecord(pin) &&
        typeof pin.botId === "string" &&
        typeof pin.messageId === "string" &&
        typeof pin.text === "string" &&
        typeof pin.pinnedAt === "string",
    )
  );
}
