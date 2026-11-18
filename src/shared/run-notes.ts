import type { RunNote } from "./ipc";

/** A run that starts more than this after its time counts as late (the timer ticks every 30 s). */
export const LATE_AFTER_MS = 5 * 60_000;

/** The note for a run starting now that was due at `dueAt`: late, or null when on time. */
export function lateNote(dueAt: string | null, now: Date): RunNote | null {
  if (!dueAt) return null;
  const due = Date.parse(dueAt);
  if (Number.isNaN(due) || now.getTime() - due <= LATE_AFTER_MS) return null;
  return { kind: "late", at: now.toISOString(), dueAt };
}

/** Sets a waiting note once (keeps the first time it started waiting). True when it changed. */
export function noteWaiting(
  target: { lastNote?: RunNote | null; nextRunAt: string | null },
  kind: "paused" | "busy",
  now: Date,
): boolean {
  if (target.lastNote?.kind === kind) return false;
  target.lastNote = {
    kind,
    at: now.toISOString(),
    ...(target.nextRunAt ? { dueAt: target.nextRunAt } : {}),
  };
  return true;
}
