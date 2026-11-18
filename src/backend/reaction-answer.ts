import type { ConversationMessage, MessageReaction } from "../shared/ipc";

const YES = new Set<MessageReaction>(["👍", "✅", "💯", "🚀", "👏"]);
const NO = new Set<MessageReaction>(["👎"]);

export const REACTION_YES = "Yes, go ahead.";
export const REACTION_NO = "No, please don't do that.";

/** The last line of a reply asks the owner something ("Shall I send it?"). */
export function asksTheOwner(text: string): boolean {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.replace(/[*_`)\]\s]+$/u, "").trim())
    .filter(Boolean);
  const last = lines.at(-1) ?? "";
  return /[?？]$/u.test(last);
}

/**
 * A thumbs-up on a coworker's question is the owner's "yes", a thumbs-down its "no": the
 * coworker gets that answer as a message. Only for the newest reply, only when it ends with a
 * question, and only when the owner has not written anything after it. Otherwise a reaction
 * stays a reaction. Returns the answer to send, or null.
 */
export function reactionAnswer(
  messages: readonly ConversationMessage[],
  messageId: string,
  emoji: MessageReaction | null,
): string | null {
  if (!emoji) return null;
  const answer = YES.has(emoji) ? REACTION_YES : NO.has(emoji) ? REACTION_NO : null;
  if (!answer) return null;
  const index = messages.findIndex((message) => message.id === messageId);
  const target = messages[index];
  if (target?.author !== "assistant" || target.itemType === "commentary") return null;
  if (!asksTheOwner(target.text ?? "")) return null;
  const later = messages.slice(index + 1);
  // The owner already answered in words, or the coworker said more after the question.
  if (later.some((message) => message.author === "user")) return null;
  if (
    later.some(
      (message) =>
        message.author === "assistant" &&
        message.itemType !== "toolCall" &&
        message.itemType !== "commentary" &&
        Boolean(message.text?.trim()),
    )
  ) {
    return null;
  }
  return answer;
}
