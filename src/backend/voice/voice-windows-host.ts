import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { VOICE_ENGINE } from "./voice-catalog";
import {
  type DictationSetup,
  REQUEST_TIMEOUT_MS,
  type SpeechSetup,
  type VoiceHost,
} from "./voice-host";
import { VOICE_HOST_SCRIPT } from "./voice-host-script";

const IDLE_SHUTDOWN_MS = 10 * 60_000;

interface HostRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface WindowsVoiceHostOptions {
  /** The voice folder: the host script and the tmp folder live here. */
  root: string;
  engineDir: string;
  powershellPath: string;
}

/**
 * The Windows host: one PowerShell process that loads the engine's .NET binding and keeps the
 * models in memory. It starts on the first request and stops after ten idle minutes.
 */
export class WindowsVoiceHost implements VoiceHost {
  readonly #root: string;
  readonly #engineDir: string;
  readonly #powershell: string;
  #host: ChildProcessWithoutNullStreams | null = null;
  #hostReady: Promise<void> | null = null;
  readonly #pending = new Map<number, HostRequest>();
  #nextId = 1;
  #idleTimer: NodeJS.Timeout | null = null;

  constructor(options: WindowsVoiceHostOptions) {
    this.#root = options.root;
    this.#engineDir = options.engineDir;
    this.#powershell = options.powershellPath;
  }

  async transcribe(setup: DictationSetup, samples: Float32Array): Promise<string> {
    const clip = join(this.#root, "tmp", `clip-${Date.now()}-${this.#nextId}.f32`);
    await mkdir(dirname(clip), { recursive: true });
    await writeFile(clip, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
    try {
      const reply = await this.#request({ op: "transcribe", asr: setup, pcm: clip });
      return typeof reply.text === "string" ? reply.text : "";
    } finally {
      await rm(clip, { force: true });
    }
  }

  async speak(
    setup: SpeechSetup,
    text: string,
    speaker: number,
    speed: number,
  ): Promise<Uint8Array> {
    const out = join(this.#root, "tmp", `speech-${Date.now()}-${this.#nextId}.wav`);
    await mkdir(dirname(out), { recursive: true });
    try {
      await this.#request({ op: "speak", tts: setup, text, sid: speaker, speed, out });
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(out, { force: true });
    }
  }

  async stop(): Promise<void> {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    await this.#stopHost();
  }

  async #startHost(): Promise<void> {
    const script = join(this.#root, "voice-host.ps1");
    // A byte-order mark makes Windows PowerShell 5.1 read the script as UTF-8.
    await writeFile(script, `﻿${VOICE_HOST_SCRIPT}`, "utf8");
    const lib = join(this.#engineDir, "lib");
    const binding = join(this.#engineDir, "binding", ...VOICE_ENGINE.binding.entry.split("/"));
    const child = spawn(
      this.#powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-Lib",
        lib,
        "-Binding",
        binding,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.#host = child;
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
    });
    await new Promise<void>((resolvePromise, reject) => {
      const lines = createInterface({ input: child.stdout });
      let ready = false;
      lines.on("line", (line) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (!ready && message.ready === true) {
          ready = true;
          resolvePromise();
          return;
        }
        const id = typeof message.id === "number" ? message.id : -1;
        const request = this.#pending.get(id);
        if (!request) return;
        this.#pending.delete(id);
        clearTimeout(request.timer);
        if (message.ok === true) request.resolve(message);
        else request.reject(new Error(String(message.error ?? "The voice engine failed.")));
      });
      child.on("exit", (code) => {
        this.#host = null;
        this.#hostReady = null;
        const reason = new Error(
          `The voice engine stopped (code ${code ?? "?"}). ${lastUsefulLine(stderr)}`.trim(),
        );
        if (!ready) reject(reason);
        for (const request of this.#pending.values()) {
          clearTimeout(request.timer);
          request.reject(reason);
        }
        this.#pending.clear();
      });
      child.on("error", (error) => reject(error));
    });
  }

  async #request(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.#hostReady ??= this.#startHost().catch((error) => {
      this.#hostReady = null;
      throw error;
    });
    await this.#hostReady;
    const host = this.#host;
    if (!host) throw new Error("The voice engine is not running.");
    this.#touch();
    const id = this.#nextId++;
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("The voice engine took too long. Try a shorter clip."));
        void this.#stopHost();
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(id, { resolve: resolvePromise, reject, timer });
      host.stdin.write(`${JSON.stringify({ id, ...body })}\n`);
    });
  }

  #touch(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => void this.#stopHost(), IDLE_SHUTDOWN_MS);
    this.#idleTimer.unref?.();
  }

  async #stopHost(): Promise<void> {
    const host = this.#host;
    this.#host = null;
    this.#hostReady = null;
    if (!host) return;
    host.stdin.end();
    await new Promise<void>((resolvePromise) => {
      const timer = setTimeout(() => {
        host.kill();
        resolvePromise();
      }, 3_000);
      host.once("exit", () => {
        clearTimeout(timer);
        resolvePromise();
      });
    });
  }
}

function lastUsefulLine(output: string): string {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^at |^\+|CategoryInfo|FullyQualifiedErrorId/.test(line))
      .at(-1) ?? ""
  ).slice(0, 240);
}
