import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { DraftAttachment } from "../../../shared/ipc";
import { featureOn } from "../features";
import { type MessageKey, t } from "../i18n";
import { LocalDictation } from "../local-dictation";
import { language, speechLocale } from "../preferences";
import {
  formatDuration,
  INITIAL_VOICE_STATE,
  MAX_RECORDING_MS,
  type VoiceEvent,
  type VoicePhase,
  VoiceRecorderController,
  voiceReducer,
} from "../voice-recorder";
import { cleanVoiceError, loadVoiceState, localDictationReady, voiceState } from "../voice-store";
import { recognitionConstructor, type SpeechRecognitionLike } from "./VoiceInputButton";

/** The free on-PC model to offer first for each app language. */
export function preferredDictationModels(code: string): string[] {
  if (code === "en" || code === "hi") return ["hinglish-swift", "english-fast"];
  return [`indic-${code}`, "hinglish-swift"];
}

/**
 * The languages a person can say they will speak in, beside the mic. Each one lists the on-PC
 * models that write it, best first. Hinglish writes Hindi in English letters; हिन्दी and বাংলা
 * write their own script, which the Hinglish model can never do.
 */
export const SPOKEN_CHOICES: Array<{
  code: string;
  label: string;
  models: string[];
  /** Set for languages written by the on-PC Whisper model: the language it is told to expect. */
  whisper?: string;
  /** Listed under "More languages" instead of as a quick chip. */
  more?: boolean;
}> = [
  { code: "hi-en", label: "Hinglish", models: ["hinglish-swift", "hinglish-apex"] },
  { code: "en", label: "English", models: ["english-fast", "whisper-turbo"] },
  { code: "hi", label: "हिन्दी", models: ["indic-hi"] },
  { code: "bn", label: "বাংলা", models: ["indic-bn"] },
  ...(
    [
      ["es", "Español"],
      ["fr", "Français"],
      ["de", "Deutsch"],
      ["ar", "العربية"],
      ["pt", "Português"],
      ["ru", "Русский"],
      ["ja", "日本語"],
      ["zh", "中文"],
      ["ko", "한국어"],
      ["it", "Italiano"],
      ["tr", "Türkçe"],
      ["nl", "Nederlands"],
      ["pl", "Polski"],
      ["he", "עברית"],
    ] as const
  ).map(([code, label]) => ({
    code,
    label,
    models: ["whisper-turbo"],
    whisper: code,
    more: true,
  })),
];

const SPOKEN_KEY = "sahkarmi.voice.spoken";

function rememberedSpoken(): string | null {
  try {
    const value = window.localStorage.getItem(SPOKEN_KEY);
    return SPOKEN_CHOICES.some((choice) => choice.code === value) ? value : null;
  } catch {
    return null;
  }
}

/** The spoken language a model writes, or null when no choice above uses it. */
export function spokenForModel(modelId: string | null | undefined): string | null {
  if (!modelId) return null;
  return SPOKEN_CHOICES.find((choice) => choice.models.includes(modelId))?.code ?? null;
}

/**
 * The model to use for a spoken language: one already on this PC first, otherwise the first one
 * to download. Null when the catalogue has none of them.
 */
export function modelForSpoken<T extends { id: string; installed: boolean }>(
  code: string,
  models: T[],
): T | null {
  const ids = SPOKEN_CHOICES.find((choice) => choice.code === code)?.models ?? [`indic-${code}`];
  const known = ids
    .map((id) => models.find((model) => model.id === id))
    .filter((model): model is T => Boolean(model));
  return known.find((model) => model.installed) ?? known[0] ?? null;
}

const PHASE_KEYS: Record<VoicePhase, MessageKey> = {
  idle: "voiceIdle",
  "requesting-permission": "voiceRequesting",
  recording: "voiceRecording",
  paused: "voicePaused",
  processing: "voiceProcessing",
  preview: "voicePreview",
  sending: "voiceSending",
  complete: "voiceComplete",
  error: "voiceError",
};

/**
 * Voice notes: record, preview, then attach the audio (and any text you typed or dictated) to
 * the message. Coworkers cannot listen to audio, so the panel says so instead of pretending.
 */
export function VoiceRecorder(props: {
  disabled?: boolean;
  onAttach: (attachments: DraftAttachment[], transcript: string) => void;
  onError: (message: string) => void;
  /** Changing this number starts a recording, as if the mic button was pressed. */
  startRequest?: number;
}) {
  const [state, setState] = createSignal(INITIAL_VOICE_STATE);
  const [open, setOpen] = createSignal(false);
  const [audioUrl, setAudioUrl] = createSignal<string | null>(null);
  let blob: Blob | null = null;
  let recognition: SpeechRecognitionLike | null = null;
  let local: LocalDictation | null = null;
  const [writing, setWriting] = createSignal(false);
  const [dictationMode, setDictationMode] = createSignal<"local" | "online" | null>(null);
  /**
   * dictate: like ChatGPT, the words go into the message box and no audio is kept ·
   * note: the older voice note with an audio file · setup: offer the free on-PC model first.
   */
  const [mode, setMode] = createSignal<"dictate" | "note" | "setup">("note");
  onMount(loadVoiceState);
  const [spokenChoice, setSpokenChoice] = createSignal<string | null>(rememberedSpoken());
  /** What the owner said they speak; else what the chosen model writes; else the app language. */
  const spoken = createMemo(() => {
    const chosen = spokenChoice();
    if (chosen) return chosen;
    const fromModel = spokenForModel(voiceState()?.settings.dictationModel);
    if (fromModel) return fromModel;
    const app = language();
    if (app === "bn") return "bn";
    // A world app language: speak it, written by the on-PC Whisper model.
    if (SPOKEN_CHOICES.some((choice) => choice.more && choice.code === app)) return app;
    return "hi-en";
  });
  const offered = createMemo(() => {
    const models = voiceState()?.models.filter((model) => model.type === "dictation") ?? [];
    const forSpoken = modelForSpoken(spoken(), models);
    if (forSpoken) return forSpoken;
    for (const id of preferredDictationModels(language())) {
      const model = models.find((candidate) => candidate.id === id);
      if (model) return model;
    }
    return models[0] ?? null;
  });
  /** The spoken language's model is on this PC and is the one in use. */
  const spokenReady = () => {
    const model = offered();
    return Boolean(
      model?.installed &&
        localDictationReady() &&
        voiceState()?.settings.dictationModel === model.id,
    );
  };

  /** Speak in: switch to the language's model, or offer to download it (once). */
  async function chooseSpoken(code: string) {
    if (code === spoken()) return;
    setSpokenChoice(code);
    try {
      window.localStorage.setItem(SPOKEN_KEY, code);
    } catch {
      // Storage blocked: the choice lasts until Sahkarmi closes.
    }
    const whisper = SPOKEN_CHOICES.find((choice) => choice.code === code)?.whisper;
    if (whisper) {
      // Whisper is told which language to expect, so it does not guess wrongly on short phrases.
      await window.sahkarmi.voice
        .setSettings({ dictationLanguage: whisper })
        .catch((error) => props.onError(cleanVoiceError(error)));
    }
    const model = offered();
    if (model?.installed) {
      try {
        // Each phrase is written by the model in settings, so the next words use the new one.
        await window.sahkarmi.voice.setSettings({ dictationModel: model.id });
      } catch (error) {
        props.onError(cleanVoiceError(error));
      }
      return;
    }
    // Not downloaded yet: stop listening and offer it, instead of writing the wrong language.
    cancel();
    setOpen(true);
    setMode("setup");
  }
  const offerBytes = () => {
    const model = offered();
    const state = voiceState();
    if (!model || !state) return 0;
    return model.sizeBytes + (state.engineInstalled ? 0 : state.engineSizeBytes);
  };
  // The free model just finished downloading: start listening straight away.
  createEffect(
    on(
      () => mode() === "setup" && open() && localDictationReady(),
      (ready) => {
        if (ready) void start();
      },
      { defer: true },
    ),
  );
  const dispatch = (event: VoiceEvent) => setState((current) => voiceReducer(current, event));

  const controller = new VoiceRecorderController({
    onTick: (elapsedMs, level) => dispatch({ type: "tick", elapsedMs, level }),
    // Dictating: the time limit finishes like Done, so the words still reach the message box.
    onLimit: () => void (mode() === "dictate" && local ? finishDictation() : stop()),
  });

  function releaseAudio() {
    const url = audioUrl();
    if (url) URL.revokeObjectURL(url);
    setAudioUrl(null);
    blob = null;
  }

  createEffect(
    on(
      () => props.startRequest,
      (request) => {
        if (request && !open() && !props.disabled) void start();
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    controller.dispose();
    local?.cancel();
    recognition?.stop();
    releaseAudio();
  });

  let finishingRun = 0;

  async function start(asNote = false) {
    releaseAudio();
    setDictationMode(null);
    setOpen(true);
    const model = offered();
    if (!asNote && window.sahkarmi?.voice && model && !model.installed) {
      setMode("setup");
      return;
    }
    if (!asNote && model?.installed && !spokenReady()) {
      try {
        await window.sahkarmi.voice.setSettings({ dictationModel: model.id });
      } catch {
        // The model already in use keeps working.
      }
    }
    setMode(!asNote && localDictationReady() ? "dictate" : "note");
    dispatch({ type: "start" });
    try {
      await controller.start();
      dispatch({ type: "permission-granted" });
      if (localDictationReady()) void startLocalDictation();
      else if (featureOn("live-dictation")) startDictation();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      dispatch({
        type: "permission-denied",
        message:
          name === "NotAllowedError" || name === "SecurityError"
            ? t("voiceMicDenied")
            : name === "NotFoundError"
              ? t("voiceNoMic")
              : t("voiceUnsupportedRecorder"),
      });
    }
  }

  /** Text made on this PC by the downloaded model; the recording continues if it fails. */
  async function startLocalDictation() {
    local = new LocalDictation({
      onText: (text) => dispatch({ type: "dictated", text }),
      onError: (message) => props.onError(cleanVoiceError(message)),
      onBusy: setWriting,
    });
    setDictationMode("local");
    try {
      await local.start(controller.stream);
    } catch (error) {
      local = null;
      setDictationMode(null);
      // The recording goes on as a voice note, so Done never throws away what was said.
      setMode("note");
      props.onError(cleanVoiceError(error));
    }
  }

  function startDictation() {
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    setDictationMode("online");
    recognition = new Recognition();
    recognition.lang = speechLocale();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) dispatch({ type: "dictated", text: result[0].transcript });
      }
    };
    recognition.onerror = () => {
      recognition = null; // Dictation is optional; the recording continues.
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  async function stop() {
    dispatch({ type: "stop" });
    void local?.stop();
    local = null;
    recognition?.stop();
    recognition = null;
    try {
      const result = await controller.stop();
      blob = result.blob;
      setAudioUrl(URL.createObjectURL(result.blob));
      dispatch({ type: "processed", durationMs: result.durationMs });
    } catch (error) {
      dispatch({ type: "fail", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function download() {
    const model = offered();
    if (!model) return;
    try {
      if (model.installed) await window.sahkarmi.voice.setSettings({ dictationModel: model.id });
      else await window.sahkarmi.voice.install(model.id);
    } catch (error) {
      props.onError(cleanVoiceError(error));
    }
  }

  /** Done (✓): wait for the last words, put the text in the message box, keep no audio. */
  async function finishDictation() {
    const finishing = local;
    local = null;
    finishingRun += 1;
    const run = finishingRun;
    setWriting(true);
    controller.pause();
    try {
      await finishing?.stop();
    } finally {
      controller.dispose();
      setWriting(false);
    }
    // Cancelled while the last words were being written: say nothing.
    if (run !== finishingRun || !open()) return;
    const text = state().transcript.trim();
    setOpen(false);
    setDictationMode(null);
    dispatch({ type: "reset" });
    if (text) props.onAttach([], text);
    else props.onError(t("voiceNothingHeard"));
  }

  function cancel() {
    finishingRun += 1;
    controller.dispose();
    local?.cancel();
    local = null;
    setWriting(false);
    setDictationMode(null);
    recognition?.stop();
    recognition = null;
    releaseAudio();
    dispatch({ type: "cancel" });
    setOpen(false);
  }

  /** Dictation done: put only the words in the message box and drop the audio. */
  function useTextOnly() {
    const transcript = state().transcript.trim();
    if (!transcript) return;
    props.onAttach([], transcript);
    releaseAudio();
    setOpen(false);
    setDictationMode(null);
    dispatch({ type: "reset" });
  }

  async function attach() {
    if (!blob) return;
    dispatch({ type: "send" });
    try {
      const extension = blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const attachments = await window.sahkarmi.agent.importData([
        {
          name: `voice-note-${stamp}.${extension}`,
          mimeType: blob.type || "audio/webm",
          bytes: new Uint8Array(await blob.arrayBuffer()),
        },
      ]);
      dispatch({ type: "sent" });
      props.onAttach(attachments, state().transcript.trim());
      releaseAudio();
      setOpen(false);
      setDictationMode(null);
      dispatch({ type: "reset" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "fail", message });
      props.onError(message);
    }
  }

  const phase = () => state().phase;
  const active = () => phase() === "recording" || phase() === "paused";

  return (
    <div class="voice-recorder">
      <button
        type="button"
        class="composer-icon-button voice-input-button"
        classList={{ "voice-input-listening": phase() === "recording" }}
        aria-label={open() ? t("voiceRecording") : t("voiceRecord")}
        aria-expanded={open()}
        title={t("voiceRecord")}
        disabled={props.disabled && !open()}
        onClick={() => (open() ? undefined : void start())}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
          <path d="M4.8 9.5a5.2 5.2 0 0 0 10.4 0M10 14.7V17" />
        </svg>
        <Show when={phase() === "recording"}>
          <span class="voice-input-pulse" aria-hidden="true" />
        </Show>
      </button>
      <Show when={open()}>
        <button
          type="button"
          class="voice-backdrop"
          aria-label="Cancel recording"
          onClick={cancel}
        />
        <div
          class="voice-panel"
          classList={{ "voice-panel-dictate": mode() === "dictate" }}
          role="dialog"
          aria-label={t("voiceRecord")}
        >
          <Show when={window.sahkarmi?.voice && voiceState()}>
            <fieldset class="voice-spoken" aria-label={t("voiceSpeakIn")}>
              <span class="voice-spoken-label">{t("voiceSpeakIn")}</span>
              <For each={SPOKEN_CHOICES.filter((choice) => !choice.more)}>
                {(choice) => (
                  <button
                    type="button"
                    class="voice-spoken-choice"
                    classList={{ "voice-spoken-active": spoken() === choice.code }}
                    aria-pressed={spoken() === choice.code}
                    title={t("voiceSpeakHint")}
                    onClick={() => void chooseSpoken(choice.code)}
                  >
                    {choice.label}
                  </button>
                )}
              </For>
              <label class="voice-spoken-more">
                <span class="sr-only">{t("voiceMoreLanguages")}</span>
                <select
                  classList={{
                    "voice-spoken-active": SPOKEN_CHOICES.some(
                      (choice) => choice.more && choice.code === spoken(),
                    ),
                  }}
                  value={
                    SPOKEN_CHOICES.some((choice) => choice.more && choice.code === spoken())
                      ? spoken()
                      : ""
                  }
                  onChange={(event) => {
                    const code = event.currentTarget.value;
                    if (code) void chooseSpoken(code);
                  }}
                >
                  <option value="">{t("voiceMoreLanguages")}</option>
                  <For each={SPOKEN_CHOICES.filter((choice) => choice.more)}>
                    {(choice) => <option value={choice.code}>{choice.label}</option>}
                  </For>
                </select>
              </label>
            </fieldset>
          </Show>
          <Show when={mode() === "setup"}>
            {(() => {
              const busy = () =>
                offered()?.phase === "downloading" || offered()?.phase === "installing";
              const percent = () => {
                const model = offered();
                return model?.sizeBytes
                  ? Math.min(100, Math.round((model.receivedBytes / model.sizeBytes) * 100))
                  : 0;
              };
              return (
                <div class="voice-setup">
                  <h3>{t("voiceSetupTitle")}</h3>
                  <p>{t("voiceSetupBody")}</p>
                  <Show
                    when={busy()}
                    fallback={
                      <>
                        <Show when={offered()?.phase === "failed"}>
                          <p class="voice-error" role="alert">
                            {offered()?.message ?? t("voiceSetupFailed")}
                          </p>
                        </Show>
                        <button
                          type="button"
                          class="button-primary"
                          onClick={() => void download()}
                        >
                          {t("voiceSetupDownload", {
                            size: `${Math.max(1, Math.round(offerBytes() / 1_000_000))} MB`,
                          })}
                        </button>
                      </>
                    }
                  >
                    <div
                      class="voice-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent()}
                    >
                      <span style={{ width: `${percent()}%` }} />
                    </div>
                    <p class="settings-meta" role="status">
                      {offered()?.phase === "installing"
                        ? t("voiceSetupInstalling")
                        : t("voiceSetupProgress", { percent: String(percent()) })}
                    </p>
                  </Show>
                  <p class="settings-meta">
                    {t("voiceSetupModel", { name: offered()?.name ?? "" })}
                  </p>
                  <div class="voice-actions">
                    <button type="button" class="button-danger-quiet" onClick={cancel}>
                      {t("cancel")}
                    </button>
                    <button type="button" onClick={() => void start(true)}>
                      {t("voiceSetupNote")}
                    </button>
                  </div>
                </div>
              );
            })()}
          </Show>
          <Show when={mode() !== "setup"}>
            <div class="voice-panel-head">
              <span class={`voice-phase voice-phase-${phase()}`} role="status" aria-live="polite">
                {t(PHASE_KEYS[phase()])}
              </span>
              <span class="voice-timer">
                {formatDuration(state().durationMs ?? state().elapsedMs)} /{" "}
                {formatDuration(MAX_RECORDING_MS)}
              </span>
            </div>
            <Show when={active()}>
              <div class="voice-level" aria-hidden="true">
                <span style={{ transform: `scaleX(${Math.max(0.04, state().level)})` }} />
              </div>
            </Show>
            <Show when={state().error}>
              <p class="voice-error" role="alert">
                {state().error}
              </p>
            </Show>
            <Show when={phase() === "preview" || phase() === "sending"}>
              <audio
                class="voice-audio"
                controls
                src={audioUrl() ?? undefined}
                onLoadedMetadata={(event) => revealRecordedDuration(event.currentTarget)}
              >
                <track kind="captions" />
              </audio>
              <label class="voice-transcript">
                <span>
                  {state().transcriptSource === "live-dictation"
                    ? t("voiceTextDictated")
                    : t("voiceTextTyped")}
                </span>
                <textarea
                  rows={3}
                  value={state().transcript}
                  placeholder={t("voiceTextPlaceholder")}
                  onInput={(event) =>
                    dispatch({ type: "edit-transcript", text: event.currentTarget.value })
                  }
                />
              </label>
              <p class="voice-honest">{t("voiceHonest")}</p>
            </Show>
            <Show when={active() && dictationMode() === "online"}>
              <p class="voice-honest">{t("voiceDictationDisclosure")}</p>
            </Show>
            <Show when={dictationMode() === "local" && (active() || writing())}>
              <p class="voice-honest">
                {writing() ? t("voiceLocalWriting") : t("voiceLocalDisclosure")}
              </p>
            </Show>
            <Show when={active() && dictationMode() === "local" && state().transcript}>
              <p class="voice-live-text" aria-live="polite">
                {state().transcript}
              </p>
            </Show>
            <div class="voice-actions">
              <button type="button" class="button-danger-quiet" onClick={cancel}>
                {phase() === "preview" ? t("voiceDiscard") : t("cancel")}
              </button>
              <Show when={phase() === "recording"}>
                <button
                  type="button"
                  onClick={() => {
                    controller.pause();
                    local?.pause();
                    dispatch({ type: "pause" });
                  }}
                >
                  {t("pause")}
                </button>
              </Show>
              <Show when={phase() === "paused"}>
                <button
                  type="button"
                  onClick={() => {
                    controller.resume();
                    local?.resume();
                    dispatch({ type: "resume" });
                  }}
                >
                  {t("resume")}
                </button>
              </Show>
              <Show when={active() && mode() === "dictate"}>
                <button
                  type="button"
                  class="button-primary"
                  disabled={writing() && !local}
                  onClick={() => void finishDictation()}
                >
                  {writing() && !local ? t("voiceLocalWriting") : `✓ ${t("voiceDone")}`}
                </button>
              </Show>
              <Show when={active() && mode() === "note"}>
                <button type="button" class="button-primary" onClick={() => void stop()}>
                  {t("voiceStop")}
                </button>
              </Show>
              <Show when={phase() === "preview" && state().transcript.trim()}>
                <button type="button" onClick={useTextOnly}>
                  {t("voiceUseTextOnly")}
                </button>
              </Show>
              <Show when={phase() === "preview"}>
                <button type="button" class="button-primary" onClick={() => void attach()}>
                  {t("voiceAttach")}
                </button>
              </Show>
              <Show when={phase() === "error"}>
                <button type="button" onClick={() => void start()}>
                  {t("updateRetry")}
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/**
 * MediaRecorder WebM files carry no duration, so the player shows 0:00 until played. Seeking far
 * past the end makes Chromium scan the file and learn the real length; then rewind to the start.
 */
export function revealRecordedDuration(audio: HTMLAudioElement) {
  if (Number.isFinite(audio.duration)) return;
  const rewind = () => {
    audio.removeEventListener("durationchange", rewind);
    if (Number.isFinite(audio.duration)) audio.currentTime = 0;
  };
  audio.addEventListener("durationchange", rewind);
  audio.currentTime = Number.MAX_SAFE_INTEGER;
}
