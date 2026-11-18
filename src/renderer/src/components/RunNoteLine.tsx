import { Show } from "solid-js";
import type { RunNote } from "../../../shared/ipc";
import { t } from "../i18n";

function when(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

/** The plain sentence for why a scheduled task or routine ran late, waited or did not start. */
export function runNoteText(note: RunNote): string {
  switch (note.kind) {
    case "late":
      return t("runNoteLate", { at: when(note.at), due: when(note.dueAt) });
    case "paused":
      return t("runNotePaused", { at: when(note.at) });
    case "busy":
      return t("runNoteBusy", { at: when(note.at) });
    default:
      return t("runNoteFailed", { at: when(note.at), detail: note.detail ?? "" });
  }
}

/** One small line under a task or routine, shown only when its last run was not on time. */
export function RunNoteLine(props: { note: RunNote | null | undefined }) {
  return (
    <Show when={props.note}>
      {(note) => (
        <small class="run-note" classList={{ "run-note-failed": note().kind === "failed" }}>
          {runNoteText(note())}
        </small>
      )}
    </Show>
  );
}
