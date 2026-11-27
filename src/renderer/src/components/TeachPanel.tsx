import { createSignal, onCleanup, Show } from "solid-js";
import { teachSkillMarkdown, teachStepLines } from "../../../shared/teach";
import { t } from "../i18n";

/**
 * "Teach a task", shown while the owner has taken over the browser. Teach starts noting the
 * owner's clicks and typing; Stop shows the steps in plain words to correct and name; Save
 * makes them a skill coworkers can follow. Passwords, codes and long numbers are never noted.
 */
export function TeachPanel() {
  const [stage, setStage] = createSignal<"idle" | "recording" | "review" | "saved">("idle");
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("");
  const [when, setWhen] = createSignal("");
  const [steps, setSteps] = createSignal("");
  const [savedName, setSavedName] = createSignal("");
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  const stopClock = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  onCleanup(() => {
    stopClock();
    // Leaving the panel mid-recording must not leave the watcher on.
    if (stage() === "recording") void window.sahkarmi.browser.teachStop?.().catch(() => undefined);
  });

  async function start() {
    setError("");
    const started = await window.sahkarmi.browser.teachStart?.().catch(() => false);
    if (!started) {
      setError(t("teachCannotStart"));
      return;
    }
    setCount(0);
    setStage("recording");
    stopClock();
    timer = setInterval(() => {
      void window.sahkarmi.browser
        .teachCount?.()
        .then((value) => {
          if (typeof value === "number") setCount(value);
        })
        .catch(() => undefined);
    }, 1_200);
  }

  async function stop(keep: boolean) {
    stopClock();
    const recorded = (await window.sahkarmi.browser.teachStop?.().catch(() => [])) ?? [];
    if (!keep) {
      setStage("idle");
      return;
    }
    if (recorded.length === 0) {
      setError(t("teachNothing"));
      setStage("idle");
      return;
    }
    setSteps(teachStepLines(recorded).join("\n"));
    setName("");
    setWhen("");
    setStage("review");
  }

  async function save() {
    const title = name().trim();
    const lines = steps()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!title || lines.length === 0 || saving()) return;
    setSaving(true);
    setError("");
    try {
      await window.sahkarmi.customSkills.add(
        teachSkillMarkdown({ name: title, whenToUse: when(), lines }),
      );
      setSavedName(title);
      setStage("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="teach-panel">
      <Show when={stage() === "idle"}>
        <button type="button" class="teach-start" onClick={() => void start()}>
          <span aria-hidden="true">🎓</span>
          {t("teachStart")}
        </button>
        <span class="teach-hint">{t("teachHint")}</span>
      </Show>
      <Show when={stage() === "recording"}>
        <span class="teach-live" role="status">
          <i aria-hidden="true" />
          {t("teachRecording", { count: String(count()) })}
        </span>
        <button type="button" class="button-primary" onClick={() => void stop(true)}>
          {t("teachStop")}
        </button>
        <button type="button" onClick={() => void stop(false)}>
          {t("teachCancel")}
        </button>
      </Show>
      <Show when={stage() === "review"}>
        <form
          class="teach-review"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p>{t("teachReviewNote")}</p>
          <input
            value={name()}
            maxLength={60}
            placeholder={t("teachName")}
            aria-label={t("teachName")}
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <input
            value={when()}
            maxLength={200}
            placeholder={t("teachWhen")}
            aria-label={t("teachWhen")}
            onInput={(event) => setWhen(event.currentTarget.value)}
          />
          <textarea
            rows={6}
            value={steps()}
            aria-label={t("teachSteps")}
            onInput={(event) => setSteps(event.currentTarget.value)}
          />
          <div class="teach-actions">
            <button type="submit" class="button-primary" disabled={!name().trim() || saving()}>
              {t("teachSave")}
            </button>
            <button type="button" onClick={() => setStage("idle")}>
              {t("teachDiscard")}
            </button>
          </div>
        </form>
      </Show>
      <Show when={stage() === "saved"}>
        <span class="teach-saved" role="status">
          {t("teachSaved", { name: savedName() })}
        </span>
        <button type="button" onClick={() => setStage("idle")}>
          {t("teachAnother")}
        </button>
      </Show>
      <Show when={error()}>
        <span class="teach-error" role="alert">
          {error()}
        </span>
      </Show>
    </div>
  );
}
