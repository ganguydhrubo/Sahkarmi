/**
 * Which jobs are big enough for a team. A long ask, or one with several steps, is shared out
 * better than done by one coworker. Plain rules, no model call: the owner can always overrule.
 */
export function looksBig(text: string): boolean {
  const flat = text.trim();
  if (flat.length > 320) return true;
  const steps = flat
    .split(/\n|(?:^|\s)\d+[.)]\s|;| and then | then /i)
    .filter((part) => part.trim());
  return steps.length >= 4;
}

const ONE_COWORKER_WORDS = ["only you", "सिर्फ़ तुम", "सिर्फ तुम", "শুধু তুমি"];

/** "Only you: ..." at the start of a message keeps a big job with the coworker it was sent to. */
export function wantsOneCoworker(text: string): boolean {
  const start = text.trim().toLowerCase();
  return ONE_COWORKER_WORDS.some((words) => start.startsWith(words));
}
