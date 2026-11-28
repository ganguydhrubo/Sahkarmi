import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { VoiceModelInfo, VoiceSettings, VoiceState } from "../../shared/ipc";
import {
  downloadSize,
  MAC_ENGINE_FILES,
  MAC_VOICE_ENGINE,
  SHERPA_VERSION,
  VOICE_ENGINE,
  VOICE_MODELS,
  type VoiceArchive,
  type VoiceFile,
  type VoiceModel,
  voiceModel,
} from "./voice-catalog";
import type { DictationSetup, SpeechSetup, VoiceHost } from "./voice-host";
import { MacVoiceHost, type ProgramRunner } from "./voice-mac-host";
import { WindowsVoiceHost } from "./voice-windows-host";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  dictationModel: null,
  dictationLanguage: "",
  speakers: {},
  readAloud: false,
  speed: 1,
};

const MAX_SPOKEN_CHARS = 1_500;
const NO_ENGINE_HERE =
  "Voice typing models do not work on this computer yet. Voice notes work here.";

export interface VoiceServiceOptions {
  /** Folder that holds voice/engine, voice/models and voice/settings.json. */
  userDataPath: string;
  fetchImpl?: typeof fetch;
  /**
   * The system's bsdtar, which unpacks .tar.bz2 and .zip (Git's GNU tar does not do zip):
   * tar.exe in System32 on Windows, /usr/bin/tar on a Mac.
   */
  tarPath?: string;
  powershellPath?: string;
  /** The computer the engine runs on; the default is this one. Tests set these. */
  platform?: NodeJS.Platform;
  arch?: string;
  /** Runs one Mac engine program; tests replace it. */
  runProgram?: ProgramRunner;
}

type EngineChoice = "windows" | "arm64" | "x64";

/** Which engine this computer gets; null when there is none for it yet (Linux). */
function engineFor(platform: NodeJS.Platform, arch: string): EngineChoice | null {
  if (platform === "win32") return "windows";
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return arch;
  return null;
}

interface Progress {
  phase: VoiceModelInfo["phase"];
  received: number;
  message: string | null;
  abort?: AbortController;
}

/** Scripts we can read aloud with the Indian voices, by Unicode block. */
const SCRIPT_LANGUAGES: [RegExp, string][] = [
  [/[\u0980-\u09FF]/, "bn"],
  [/[\u0A00-\u0A7F]/, "pa"],
  [/[\u0A80-\u0AFF]/, "gu"],
  [/[\u0B00-\u0B7F]/, "or"],
  [/[\u0B80-\u0BFF]/, "ta"],
  [/[\u0C00-\u0C7F]/, "te"],
  [/[\u0C80-\u0CFF]/, "kn"],
  [/[\u0D00-\u0D7F]/, "ml"],
  [/[\u0900-\u097F]/, "hi"],
];

/** The language a reply is written in, judged by its script ("en" for Latin text). */
export function spokenLanguage(text: string): string {
  let best = "en";
  let bestCount = 0;
  for (const [pattern, code] of SCRIPT_LANGUAGES) {
    const count = text.match(new RegExp(pattern.source, "g"))?.length ?? 0;
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return bestCount > latin / 3 ? best : "en";
}

/** Turns a chat reply into something worth hearing: no code, links or markdown marks. */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPOKEN_CHARS);
}

/** Indian scripts have no capitals; end the sentence the way the script does. */
export function tidyDictation(text: string, punctuates: boolean, language: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || punctuates) return clean;
  if (language === "en") return clean.charAt(0).toUpperCase() + clean.slice(1);
  return clean;
}

export class VoiceService extends EventEmitter {
  readonly #root: string;
  readonly #fetch: typeof fetch;
  readonly #tar: string;
  /** The Windows engine or the Mac engine for this chip; null when this computer has none. */
  readonly #engine: EngineChoice | null;
  readonly #host: VoiceHost | null;
  readonly #closing = new AbortController();
  #settings: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS };
  #installed = new Set<string>();
  #engineInstalled = false;
  readonly #progress = new Map<string, Progress>();
  #engineInstall: Promise<void> | null = null;

  constructor(options: VoiceServiceOptions) {
    super();
    this.#root = join(options.userDataPath, "voice");
    this.#fetch = options.fetchImpl ?? fetch;
    this.#engine = engineFor(options.platform ?? process.platform, options.arch ?? process.arch);
    if (this.#engine === "windows") {
      const system = process.env.SystemRoot ?? "C:\\Windows";
      this.#tar = options.tarPath ?? join(system, "System32", "tar.exe");
      this.#host = new WindowsVoiceHost({
        root: this.#root,
        engineDir: this.#engineDir,
        powershellPath:
          options.powershellPath ??
          join(system, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      });
    } else {
      this.#tar = options.tarPath ?? "/usr/bin/tar";
      this.#host = this.#engine
        ? new MacVoiceHost({
            engineDir: this.#engineDir,
            tmpDir: join(this.#root, "tmp"),
            run: options.runProgram,
          })
        : null;
    }
  }

  /** A Mac names the chip too, so a Mac moved to a new chip fetches the engine that fits it. */
  get #engineDir(): string {
    const name =
      this.#engine === "arm64" || this.#engine === "x64"
        ? `${SHERPA_VERSION}-mac-${this.#engine}`
        : SHERPA_VERSION;
    return join(this.#root, "engine", name);
  }

  get #engineSize(): number {
    if (this.#engine === "windows") return VOICE_ENGINE.native.size + VOICE_ENGINE.binding.size;
    return this.#engine ? MAC_VOICE_ENGINE[this.#engine].size : 0;
  }

  #modelDir(id: string): string {
    return join(this.#root, "models", id);
  }

  async initialize(): Promise<void> {
    await mkdir(join(this.#root, "models"), { recursive: true });
    try {
      const saved = JSON.parse(await readFile(join(this.#root, "settings.json"), "utf8"));
      this.#settings = sanitizeSettings(saved);
    } catch {
      this.#settings = { ...DEFAULT_VOICE_SETTINGS };
    }
    this.#engineInstalled = await exists(join(this.#engineDir, "ready.json"));
    for (const model of VOICE_MODELS) {
      if (await exists(join(this.#modelDir(model.id), "ready.json"))) this.#installed.add(model.id);
    }
    if (this.#settings.dictationModel && !this.#installed.has(this.#settings.dictationModel)) {
      this.#settings.dictationModel = null;
    }
  }

  getState(): VoiceState {
    return {
      engineInstalled: this.#engineInstalled,
      engineSizeBytes: this.#engineSize,
      settings: { ...this.#settings, speakers: { ...this.#settings.speakers } },
      // No engine for this computer: offer no model, so nothing large is downloaded in vain.
      models: this.#engine ? VOICE_MODELS.map((model) => this.#info(model)) : [],
    };
  }

  #info(model: VoiceModel): VoiceModelInfo {
    const progress = this.#progress.get(model.id);
    return {
      id: model.id,
      type: model.type,
      group: model.type === "speech" ? "speech" : model.group,
      name: model.name,
      summary: model.summary,
      licence: model.licence,
      languages: model.languages,
      sizeBytes: downloadSize(model),
      punctuates: model.type === "dictation" ? model.punctuates : false,
      speakers: model.type === "speech" ? model.speakers : [],
      installed: this.#installed.has(model.id),
      phase: progress?.phase ?? "idle",
      receivedBytes: progress?.received ?? 0,
      message: progress?.message ?? null,
    };
  }

  #emit(): void {
    this.emit("state", this.getState());
  }

  async setSettings(patch: Partial<VoiceSettings>): Promise<VoiceState> {
    const next = sanitizeSettings({ ...this.#settings, ...patch });
    if (next.dictationModel && !this.#installed.has(next.dictationModel)) {
      throw new Error("Download that model first.");
    }
    this.#settings = next;
    await writeFile(join(this.#root, "settings.json"), JSON.stringify(next, null, 2), "utf8");
    this.#emit();
    return this.getState();
  }

  /** Downloads the engine (once) and a model, checking every file's SHA-256. */
  async install(id: string): Promise<VoiceState> {
    if (!this.#engine) throw new Error(NO_ENGINE_HERE);
    const model = voiceModel(id);
    if (!model) throw new Error("Unknown voice model.");
    if (this.#installed.has(id)) return this.getState();
    const running = this.#progress.get(id);
    if (running && (running.phase === "downloading" || running.phase === "installing")) {
      return this.getState();
    }
    const abort = new AbortController();
    this.#progress.set(id, { phase: "downloading", received: 0, message: null, abort });
    this.#emit();
    void this.#runInstall(model, abort).catch(() => undefined);
    return this.getState();
  }

  async #runInstall(model: VoiceModel, abort: AbortController): Promise<void> {
    const progress = this.#progress.get(model.id);
    if (!progress) return;
    const report = (received: number) => {
      progress.received = received;
      this.#emitThrottled();
    };
    try {
      await this.#ensureEngine(abort.signal);
      const target = this.#modelDir(model.id);
      const work = `${target}.partial`;
      await rm(work, { recursive: true, force: true });
      await mkdir(work, { recursive: true });
      if (model.archive) {
        await this.#installArchive(model.archive, work, abort.signal, report, () => {
          progress.phase = "installing";
          this.#emit();
        });
      } else {
        let done = 0;
        for (const file of model.files ?? []) {
          await this.#downloadFile(file, join(work, file.path), abort.signal, (received) =>
            report(done + received),
          );
          done += file.size;
        }
      }
      await writeFile(
        join(work, "ready.json"),
        JSON.stringify({ id: model.id, installedAt: new Date().toISOString() }),
        "utf8",
      );
      await rm(target, { recursive: true, force: true });
      await rename(work, target);
      this.#installed.add(model.id);
      this.#progress.delete(model.id);
      if (model.type === "dictation" && !this.#settings.dictationModel) {
        await this.setSettings({ dictationModel: model.id });
      }
      this.#emit();
    } catch (error) {
      await rm(`${this.#modelDir(model.id)}.partial`, { recursive: true, force: true });
      if (abort.signal.aborted) {
        this.#progress.delete(model.id);
      } else {
        progress.phase = "failed";
        progress.message = friendlyError(error);
      }
      this.#emit();
    }
  }

  #lastEmit = 0;
  #emitThrottled(): void {
    const now = Date.now();
    if (now - this.#lastEmit < 250) return;
    this.#lastEmit = now;
    this.#emit();
  }

  async cancel(id: string): Promise<VoiceState> {
    this.#progress.get(id)?.abort?.abort();
    return this.getState();
  }

  async remove(id: string): Promise<VoiceState> {
    await this.#host?.stop();
    await rm(this.#modelDir(id), { recursive: true, force: true });
    this.#installed.delete(id);
    this.#progress.delete(id);
    if (this.#settings.dictationModel === id) {
      const fallback = VOICE_MODELS.find(
        (m) => m.type === "dictation" && this.#installed.has(m.id),
      );
      await this.setSettings({ dictationModel: fallback?.id ?? null });
    }
    this.#emit();
    return this.getState();
  }

  async #ensureEngine(signal: AbortSignal): Promise<void> {
    if (this.#engineInstalled) return;
    this.#engineInstall ??= this.#installEngine(signal).finally(() => {
      this.#engineInstall = null;
    });
    await this.#engineInstall;
  }

  async #installEngine(signal: AbortSignal): Promise<void> {
    if (!this.#engine) throw new Error(NO_ENGINE_HERE);
    const work = `${this.#engineDir}.partial`;
    await rm(work, { recursive: true, force: true });
    await mkdir(work, { recursive: true });
    if (this.#engine === "windows") {
      await this.#installArchive(
        VOICE_ENGINE.native,
        work,
        signal,
        () => undefined,
        () => undefined,
      );
      const nupkg = join(work, "binding.zip");
      await this.#downloadFile(
        { path: "binding.zip", ...VOICE_ENGINE.binding },
        nupkg,
        signal,
        () => undefined,
      );
      await this.#untar(nupkg, join(work, "binding"));
      await rm(nupkg, { force: true });
    } else {
      const archive = MAC_VOICE_ENGINE[this.#engine];
      await this.#installArchive(
        archive,
        work,
        signal,
        () => undefined,
        () => undefined,
        MAC_ENGINE_FILES.map((file) => `${archive.folder}/${file}`),
      );
      // Files the app downloads itself carry no quarantine mark, so macOS lets them start.
      for (const file of MAC_ENGINE_FILES) {
        if (file.startsWith("bin/")) await chmod(join(work, ...file.split("/")), 0o755);
      }
    }
    await writeFile(join(work, "ready.json"), JSON.stringify({ version: SHERPA_VERSION }), "utf8");
    await rm(this.#engineDir, { recursive: true, force: true });
    await rename(work, this.#engineDir);
    this.#engineInstalled = true;
  }

  async #installArchive(
    archive: VoiceArchive,
    work: string,
    signal: AbortSignal,
    report: (received: number) => void,
    onUnpack: () => void,
    /** Unpack only these paths from the archive; all of it when left out. */
    only: string[] = [],
  ): Promise<void> {
    const file = join(work, basename(new URL(archive.url).pathname));
    await this.#downloadFile({ path: basename(file), ...archive }, file, signal, report);
    onUnpack();
    await this.#untar(file, work, only);
    await rm(file, { force: true });
    // Lift the archive's top folder so the model files sit directly in the model folder.
    const inner = join(work, archive.folder);
    if (await exists(inner)) {
      for (const entry of await readdir(inner)) await rename(join(inner, entry), join(work, entry));
      await rm(inner, { recursive: true, force: true });
    }
  }

  async #downloadFile(
    file: VoiceFile,
    destination: string,
    signal: AbortSignal,
    report: (received: number) => void,
  ): Promise<void> {
    await mkdir(dirname(destination), { recursive: true });
    const response = await this.#fetch(file.url, { signal, redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status}) for ${basename(file.path)}.`);
    }
    const hash = createHash("sha256");
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        received += chunk.length;
        report(received);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      meter,
      createWriteStream(destination),
      { signal },
    );
    if (hash.digest("hex") !== file.sha256) {
      await rm(destination, { force: true });
      throw new Error(`${basename(file.path)} was damaged while downloading. Try again.`);
    }
  }

  /** bsdtar with relative paths: it handles .tar.bz2 and .zip alike. */
  #untar(archive: string, directory: string, only: string[] = []): Promise<void> {
    return mkdir(directory, { recursive: true }).then(
      () =>
        new Promise<void>((resolvePromise, reject) => {
          execFile(
            this.#tar,
            ["-xf", archive, "-C", directory, ...only],
            { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
            (error) =>
              error
                ? reject(new Error(`Could not unpack ${basename(archive)}: ${error.message}`))
                : resolvePromise(),
          );
        }),
    );
  }

  // ---------------------------------------------------------------- speech-to-text

  async transcribe(samples: Float32Array): Promise<{ text: string; modelId: string }> {
    const id = this.#settings.dictationModel;
    const model = id ? voiceModel(id) : undefined;
    if (model?.type !== "dictation" || !this.#installed.has(model.id)) {
      throw new Error("Download a dictation model first: Settings → Voice.");
    }
    if (samples.length < 1_600) return { text: "", modelId: model.id };
    const dir = this.#modelDir(model.id);
    const asr: DictationSetup =
      model.kind === "nemo-ctc"
        ? {
            kind: "nemo-ctc",
            model: join(dir, "model.int8.onnx"),
            tokens: join(dir, "tokens.txt"),
            threads: threads(),
          }
        : {
            kind: "whisper",
            encoder: join(dir, "encoder.int8.onnx"),
            decoder: join(dir, "decoder.int8.onnx"),
            tokens: join(dir, "tokens.txt"),
            language:
              model.id === "whisper-turbo"
                ? this.#settings.dictationLanguage
                : (model.whisperLanguage ?? ""),
            threads: threads(),
          };
    const host = await this.#readyHost();
    const text = await host.transcribe(asr, samples);
    return {
      text: tidyDictation(text, model.punctuates, model.languages[0] ?? ""),
      modelId: model.id,
    };
  }

  // ---------------------------------------------------------------- text-to-speech

  /** Reads text aloud with the installed voice that fits its script; null when none fits. */
  async speak(raw: string): Promise<Uint8Array | null> {
    const text = speakableText(raw);
    if (!text) return null;
    const language = spokenLanguage(text);
    const voice =
      VOICE_MODELS.find(
        (m) => m.type === "speech" && this.#installed.has(m.id) && m.languages.includes(language),
      ) ?? null;
    if (voice?.type !== "speech") return null;
    const dir = this.#modelDir(voice.id);
    const tts: SpeechSetup =
      voice.kind === "vits"
        ? {
            kind: "vits",
            model: join(dir, "model.onnx"),
            tokens: join(dir, "tokens.txt"),
            threads: threads(),
          }
        : {
            kind: "kokoro",
            model: join(dir, "model.int8.onnx"),
            voices: join(dir, "voices.bin"),
            tokens: join(dir, "tokens.txt"),
            lexicon: join(dir, "lexicon-us-en.txt"),
            threads: threads(),
          };
    const speaker =
      this.#settings.speakers[language] ??
      voice.speakers.find((s) => s.languages.includes(language))?.id ??
      voice.speakers[0]?.id ??
      0;
    // Sentence-final marks make the Indian voices add a burst of noise at the end.
    const spoken = voice.kind === "vits" ? text.replace(/[.?!।]+\s*$/u, "") : text;
    const host = await this.#readyHost();
    return host.speak(tts, spoken, speaker, this.#settings.speed);
  }

  // ---------------------------------------------------------------- the engine host

  async #readyHost(): Promise<VoiceHost> {
    if (!this.#host) throw new Error(NO_ENGINE_HERE);
    // A Mac moved from an Intel chip to Apple Silicon keeps its models but needs the engine
    // built for the new chip. It is a small download, so fetch it instead of failing.
    if (!this.#engineInstalled && this.#engine !== "windows") {
      await this.#ensureEngine(this.#closing.signal).catch((error) => {
        throw new Error(friendlyError(error));
      });
    }
    if (!this.#engineInstalled) throw new Error("The voice engine is not downloaded yet.");
    return this.#host;
  }

  async dispose(): Promise<void> {
    for (const progress of this.#progress.values()) progress.abort?.abort();
    this.#closing.abort();
    await this.#host?.stop();
  }
}

function sanitizeSettings(input: unknown): VoiceSettings {
  const value = (input && typeof input === "object" ? input : {}) as Partial<VoiceSettings>;
  const speakers: Record<string, number> = {};
  if (value.speakers && typeof value.speakers === "object") {
    for (const [language, id] of Object.entries(value.speakers)) {
      if (/^[a-z]{2,3}$/.test(language) && Number.isInteger(id) && id >= 0 && id < 1024) {
        speakers[language] = id;
      }
    }
  }
  const speed = typeof value.speed === "number" && Number.isFinite(value.speed) ? value.speed : 1;
  return {
    dictationModel:
      typeof value.dictationModel === "string" && voiceModel(value.dictationModel)
        ? value.dictationModel
        : null,
    dictationLanguage:
      typeof value.dictationLanguage === "string" && /^[a-z]{0,3}$/.test(value.dictationLanguage)
        ? value.dictationLanguage
        : "",
    speakers,
    readAloud: value.readAloud === true,
    speed: Math.min(1.6, Math.max(0.7, speed)),
  };
}

function threads(): number {
  return 4;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOSPC/.test(message)) return "Not enough free disk space for this model.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(message)) {
    return "Could not reach the download server. Check the internet and try again.";
  }
  return message.slice(0, 240);
}
