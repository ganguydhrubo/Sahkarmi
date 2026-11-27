/**
 * Home learns from the owner: when the owner gives a kind of work (accounts, sales, ...) to a
 * coworker other than the suggested one twice or more, that coworker is suggested next time.
 */
const KEY = "sahkarmi:home-picks";
const NEEDED = 2;

type Picks = Record<string, Record<string, number>>;

function read(): Picks {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Picks)
      : {};
  } catch {
    return {};
  }
}

/** The owner chose this coworker for this kind of work instead of the suggested one. */
export function notePick(role: string, botId: string): void {
  const picks = read();
  const forRole = picks[role] ?? {};
  forRole[botId] = (Number(forRole[botId]) || 0) + 1;
  picks[role] = forRole;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    // Learning is a convenience; Home still works without it.
  }
}

/** The coworker the owner keeps choosing for this kind of work, or null. */
export function preferredPick(role: string): string | null {
  const forRole = read()[role];
  if (typeof forRole !== "object" || forRole === null) return null;
  let best: string | null = null;
  let bestCount = NEEDED - 1;
  for (const [botId, count] of Object.entries(forRole)) {
    if (Number(count) > bestCount) {
      best = botId;
      bestCount = Number(count);
    }
  }
  return best;
}
