/**
 * Tap-to-answer: when a coworker needs the owner to pick, it ends its reply with one line
 * "CHOICES: Yes | No | Later". The chat hides that line and shows the choices as buttons under
 * the latest reply; a tap sends the choice as the owner's answer. Pure: shared by both sides.
 */

export const CHOICES_PREFIX = "CHOICES:";

export const QUICK_REPLY_INSTRUCTION = `When you need the owner to choose between a few clear answers, end your reply with one line: ${CHOICES_PREFIX} first | second | third (2 to 6 short answers, each under 40 characters, in the owner's language). The owner taps one. Use it for questions only, never for approvals of payments, messages or deleting (those use sahkarmi.request_approval).`;

export interface QuickReplies {
  /** The reply without the choices line. */
  text: string;
  choices: string[];
}

export function parseQuickReplies(reply: string): QuickReplies {
  const lines = reply.trimEnd().split(/\r?\n/);
  const last = lines[lines.length - 1]?.trim().replace(/^[*`]+|[*`]+$/g, "") ?? "";
  if (!last.toUpperCase().startsWith(CHOICES_PREFIX)) return { text: reply, choices: [] };
  const choices = [
    ...new Set(
      last
        .slice(CHOICES_PREFIX.length)
        .split("|")
        .map((choice) => choice.trim())
        .filter((choice) => choice.length > 0 && choice.length <= 60),
    ),
  ].slice(0, 6);
  if (choices.length < 2) return { text: reply, choices: [] };
  return { text: lines.slice(0, -1).join("\n").trimEnd(), choices };
}
