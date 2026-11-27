import { Show } from "solid-js";
import type { ActivityCategory, ActivityPhase } from "../activity-hinglish";

/** The kind of work a coworker is doing right now, for the small animated badge on its avatar. */
export type WorkKind =
  | "thinking"
  | "browsing"
  | "reading"
  | "writing"
  | "coding"
  | "waiting"
  | "handing"
  | null;

const WAITING: readonly ActivityPhase[] = [
  "waiting_approval",
  "waiting_user",
  "waiting_provider",
  "queued",
  "paused",
];
const THINKING: readonly ActivityPhase[] = [
  "sending",
  "initializing",
  "thinking",
  "generating",
  "finalizing",
  "retrying",
];

/** From the real activity (phase and tool category) to one badge. Idle and finished: none. */
export function workKind(phase: ActivityPhase, category: ActivityCategory | null): WorkKind {
  if (WAITING.includes(phase)) return "waiting";
  if (phase === "researching") return "browsing";
  if (phase === "executing_tool" || phase === "processing_result") {
    switch (category) {
      case "research":
      case "browser":
        return "browsing";
      case "files_read":
        return "reading";
      case "files_write":
        return "writing";
      case "code":
      case "tests":
      case "command":
        return "coding";
      case "coworker":
        return "handing";
      case "approval":
        return "waiting";
      default:
        return "thinking";
    }
  }
  if (THINKING.includes(phase)) return "thinking";
  return null;
}

const GLYPH: Record<Exclude<WorkKind, null>, string> = {
  thinking: "✨",
  browsing: "🌐",
  reading: "📄",
  writing: "✏️",
  coding: "</>",
  waiting: "⏳",
  handing: "🤝",
};

/** A small badge on the avatar that moves the way the work does (reduced motion: still). */
export function WorkBadge(props: { kind: WorkKind }) {
  return (
    <Show when={props.kind} keyed>
      {(kind) => (
        <span class={`work-badge work-badge-${kind}`} data-kind={kind} aria-hidden="true">
          <span class="work-badge-glyph">{GLYPH[kind]}</span>
        </span>
      )}
    </Show>
  );
}
