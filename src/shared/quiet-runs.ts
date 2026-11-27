/**
 * Quiet runs: a schedule or routine that finds nothing new ends with one marker line instead of
 * pinging the owner. Sahkarmi then skips the "Finished working" notification and shows a short
 * "Nothing new this time" note in the chat. Pure: shared by the backend and the screen.
 */

export const NOTHING_TO_REPORT = "NOTHING_TO_REPORT";

/** Told to every coworker; only matters for automatic (schedule / routine) runs. */
export const QUIET_RUN_INSTRUCTION = `When a scheduled task or routine step finds nothing new or nothing that needs the owner (no new orders, no changes, nothing due), say so in one short line and end your reply with a final line containing only ${NOTHING_TO_REPORT}. Never use it for work the owner asked for directly, or when anything needs their attention.`;

/** A message the app sent on the owner's behalf for a schedule or routine. */
export function isAutomaticRun(origin: string | undefined, text: string): boolean {
  if (origin === "schedule" || origin === "routine") return true;
  return /^\[(?:Scheduled task\]|Routine ")/.test(text.trimStart());
}

/** The reply ends with the marker line. */
export function isQuietReply(text: string): boolean {
  const lines = text.trimEnd().split(/\r?\n/);
  // Models sometimes wrap it in bold or code marks, or add a full stop.
  const last = lines[lines.length - 1]?.trim().replace(/^[*`]+|[*`.]+$/g, "");
  return last === NOTHING_TO_REPORT;
}

/** The reply as the owner should read it: the marker line removed. */
export function withoutQuietMarker(text: string): string {
  if (!isQuietReply(text)) return text;
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.slice(0, -1).join("\n").trimEnd();
}
