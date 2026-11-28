import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type DictationSetup,
  REQUEST_TIMEOUT_MS,
  type SpeechSetup,
  type VoiceHost,
} from "./voice-host";

/** The engine programs the Mac host runs, inside the engine's bin folder. */
export const DICTATION_PROGRAM = "sherpa-onnx-offline";
export const SPEECH_PROGRAM = "sherpa-onnx-offline-tts";

export interface ProgramResult {
  /** Exit code; null when the program was ended by a signal. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs one program to its end. Rejects only when it cannot start or is stopped by the signal. */
export type ProgramRunner = (
  file: string,
  args: string[],
  options: { signal: AbortSignal },
) => Promise<ProgramResult>;

export const runProgram: ProgramRunner = (file, args, { signal }) =>
  new Promise((resolvePromise, reject) => {
    execFile(
      file,
      args,
      { signal, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolvePromise({ code: 0, stdout, stderr });
        const code = (error as { code?: unknown }).code;
        // A number is the program's own exit code; a word such as ENOENT means it never started.
        if (typeof code === "number") return resolvePromise({ code, stdout, stderr });
        if (typeof code !== "string" && !signal.aborted) {
          return resolvePromise({ code: null, stdout, stderr });
        }
        reject(error);
      },
    );
  });

/** 16-bit mono WAV, the one format every build of the engine reads. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples.length * 2, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // one channel
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  wav.writeUInt16LE(2, 32); // bytes per sample
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const clipped = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    wav.writeInt16LE(Math.round(clipped * 32_767), 44 + index * 2);
  }
  return wav;
}

/**
 * Command-line flags for one dictation request. They set the same values the Windows host sets
 * through the engine's API (see voice-host-script.ts).
 */
export function dictationArgs(setup: DictationSetup, wav: string): string[] {
  const args = [`--tokens=${setup.tokens}`, `--num-threads=${setup.threads}`];
  if (setup.kind === "nemo-ctc") {
    args.push(`--nemo-ctc-model=${setup.model}`);
  } else {
    args.push(
      `--whisper-encoder=${setup.encoder}`,
      `--whisper-decoder=${setup.decoder}`,
      "--whisper-task=transcribe",
      "--whisper-tail-paddings=-1",
    );
    if (setup.language) args.push(`--whisper-language=${setup.language}`);
  }
  // "--" ends the flags, so whatever follows is read as the sound file.
  args.push("--", wav);
  return args;
}

/** Command-line flags for one read-aloud request; mirrors the Windows host the same way. */
export function speechArgs(
  setup: SpeechSetup,
  request: { text: string; speaker: number; speed: number; out: string },
): string[] {
  const args = [
    `--num-threads=${setup.threads}`,
    "--tts-max-num-sentences=1",
    `--sid=${request.speaker}`,
    `--speed=${request.speed}`,
    `--output-filename=${request.out}`,
  ];
  if (setup.kind === "vits") {
    args.push(`--vits-model=${setup.model}`, `--vits-tokens=${setup.tokens}`);
  } else {
    args.push(
      `--kokoro-model=${setup.model}`,
      `--kokoro-voices=${setup.voices}`,
      `--kokoro-tokens=${setup.tokens}`,
      `--kokoro-lexicon=${setup.lexicon}`,
    );
  }
  // "--" ends the flags, so a reply that starts with dashes is still read as text.
  args.push("--", request.text);
  return args;
}

/**
 * Finds the recognised words in what the dictation program printed: one JSON line with a "text"
 * field, among log lines. Returns null when there is no such line.
 */
export function recognisedText(output: string): string | null {
  const lines = output.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      const text = (parsed as { text?: unknown } | null)?.text;
      if (typeof text === "string") return text.trim();
    } catch {
      // The engine does not escape every character; the pattern below still finds the text.
    }
  }
  const match = /"text"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/.exec(output);
  if (!match) return null;
  return (match[1] ?? "").replace(/\\([\s\S])/g, "$1").trim();
}

/** The line of the program's log that says what went wrong, without the source-file prefix. */
export function engineErrorLine(log: string): string {
  const lines = log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/parse-options\.cc:/.test(line));
  const fromEngine = lines
    .map((line) => /\.(?:cc|h|mm):[^\s:]+:\d+\s+(.+)$/.exec(line)?.[1])
    .filter((message): message is string => Boolean(message))
    .at(-1);
  return (fromEngine ?? lines.at(-1) ?? "").slice(0, 240);
}

export interface MacVoiceHostOptions {
  engineDir: string;
  /** Short-lived sound files go here. */
  tmpDir: string;
  run?: ProgramRunner;
  timeoutMs?: number;
}

/**
 * The Mac host: each request runs one of the engine's own programs and reads its answer. Nothing
 * stays in memory between requests, so there is no idle process to shut down. Requests run one at
 * a time, as on Windows, so two models are never loaded together.
 */
export class MacVoiceHost implements VoiceHost {
  readonly #engineDir: string;
  readonly #tmpDir: string;
  readonly #run: ProgramRunner;
  readonly #timeoutMs: number;
  readonly #active = new Set<AbortController>();
  #queue: Promise<unknown> = Promise.resolve();
  #nextId = 1;

  constructor(options: MacVoiceHostOptions) {
    this.#engineDir = options.engineDir;
    this.#tmpDir = options.tmpDir;
    this.#run = options.run ?? runProgram;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  transcribe(setup: DictationSetup, samples: Float32Array): Promise<string> {
    return this.#inTurn(async (signal) => {
      const clip = await this.#tmpFile("clip");
      try {
        await writeFile(clip, encodeWav(samples, 16_000));
        const result = await this.#program(DICTATION_PROGRAM, dictationArgs(setup, clip), signal);
        const text = recognisedText(result.stdout) ?? recognisedText(result.stderr);
        if (text === null) throw new Error("The voice engine gave no text. Try again.");
        return text;
      } finally {
        await rm(clip, { force: true });
      }
    });
  }

  speak(setup: SpeechSetup, text: string, speaker: number, speed: number): Promise<Uint8Array> {
    return this.#inTurn(async (signal) => {
      const out = await this.#tmpFile("speech");
      try {
        await this.#program(
          SPEECH_PROGRAM,
          speechArgs(setup, { text, speaker, speed, out }),
          signal,
        );
        return new Uint8Array(await readFile(out));
      } finally {
        await rm(out, { force: true });
      }
    });
  }

  /** Ends the running program and every request waiting behind it. */
  async stop(): Promise<void> {
    for (const controller of this.#active) controller.abort();
    await this.#queue.catch(() => undefined);
  }

  async #tmpFile(name: string): Promise<string> {
    await mkdir(this.#tmpDir, { recursive: true });
    return join(this.#tmpDir, `${name}-${Date.now()}-${this.#nextId++}.wav`);
  }

  #inTurn<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.#active.add(controller);
    const turn = this.#queue
      .catch(() => undefined)
      .then(async () => {
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, this.#timeoutMs);
        try {
          if (controller.signal.aborted) throw new Error("stopped");
          return await work(controller.signal);
        } catch (error) {
          if (timedOut) throw new Error("The voice engine took too long. Try a shorter clip.");
          if (controller.signal.aborted) throw new Error("The voice engine stopped.");
          throw error;
        } finally {
          clearTimeout(timer);
          this.#active.delete(controller);
        }
      });
    this.#queue = turn;
    return turn;
  }

  async #program(name: string, args: string[], signal: AbortSignal): Promise<ProgramResult> {
    let result: ProgramResult;
    try {
      result = await this.#run(join(this.#engineDir, "bin", name), args, { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The voice engine could not start. ${reason}`.slice(0, 300));
    }
    if (result.code !== 0) {
      throw new Error(
        `The voice engine failed (code ${result.code ?? "?"}). ${engineErrorLine(result.stderr)}`.trim(),
      );
    }
    return result;
  }
}
