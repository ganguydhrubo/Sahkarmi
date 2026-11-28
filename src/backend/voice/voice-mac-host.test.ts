import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VoiceState } from "../../shared/ipc";
import { MAC_VOICE_ENGINE, SHERPA_VERSION, VOICE_ENGINE, VOICE_MODELS } from "./voice-catalog";
import {
  dictationArgs,
  encodeWav,
  engineErrorLine,
  MacVoiceHost,
  type ProgramResult,
  type ProgramRunner,
  recognisedText,
  speechArgs,
} from "./voice-mac-host";
import { VoiceService } from "./voice-service";

const folders: string[] = [];
async function tempFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "sahkarmi-voice-mac-"));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

/** One line the real dictation program (engine 2.0.0) printed for a short English clip. */
const REAL_LINE =
  '{"lang": "hi", "emotion": "", "event": "", "text": "Please send the report.", "timestamps": [], "durations": [], "tokens":["Please", " send", " the", " report", "."], "ys_log_probs": [], "words": []}';

function heard(text: string): ProgramResult {
  return { code: 0, stdout: `${JSON.stringify({ lang: "", text, tokens: [] })}\n`, stderr: "" };
}

interface Call {
  file: string;
  args: string[];
}

/** A program runner that never returns until it is stopped, like a busy engine. */
const hangingRunner: ProgramRunner = (_file, _args, { signal }) =>
  new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

function flag(args: string[], name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

describe("Mac engine helpers", () => {
  it("writes a 16-bit mono WAV with a correct header and length", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2, Number.NaN]), 16_000);
    expect(wav.length).toBe(44 + 8 * 2);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.toString("ascii", 8, 16)).toBe("WAVEfmt ");
    expect(wav.readUInt32LE(16)).toBe(16);
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(28)).toBe(32_000);
    expect(wav.readUInt16LE(32)).toBe(2);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(16);
    const samples = Array.from({ length: 8 }, (_, index) => wav.readInt16LE(44 + index * 2));
    // Loud samples are clipped, never wrapped around; a broken sample becomes silence.
    expect(samples).toEqual([0, 16_384, -16_383, 32_767, -32_767, 32_767, -32_767, 0]);
  });

  it("writes an empty clip as a header alone", () => {
    const wav = encodeWav(new Float32Array(0), 16_000);
    expect(wav.length).toBe(44);
    expect(wav.readUInt32LE(40)).toBe(0);
  });

  it("builds the flags for a CTC dictation model", () => {
    expect(
      dictationArgs(
        { kind: "nemo-ctc", model: "/m/model.int8.onnx", tokens: "/m/t.txt", threads: 4 },
        "/tmp/a.wav",
      ),
    ).toEqual([
      "--tokens=/m/t.txt",
      "--num-threads=4",
      "--nemo-ctc-model=/m/model.int8.onnx",
      "--",
      "/tmp/a.wav",
    ]);
  });

  it("builds the flags for a Whisper model, with and without a language", () => {
    const setup = {
      kind: "whisper" as const,
      encoder: "/m/Application Support/encoder.int8.onnx",
      decoder: "/m/decoder.int8.onnx",
      tokens: "/m/tokens.txt",
      threads: 4,
    };
    expect(dictationArgs({ ...setup, language: "hi" }, "/tmp/a.wav")).toEqual([
      "--tokens=/m/tokens.txt",
      "--num-threads=4",
      "--whisper-encoder=/m/Application Support/encoder.int8.onnx",
      "--whisper-decoder=/m/decoder.int8.onnx",
      "--whisper-task=transcribe",
      "--whisper-tail-paddings=-1",
      "--whisper-language=hi",
      "--",
      "/tmp/a.wav",
    ]);
    const auto = dictationArgs({ ...setup, language: "" }, "/tmp/a.wav");
    expect(auto.some((arg) => arg.startsWith("--whisper-language"))).toBe(false);
    expect(auto.slice(-2)).toEqual(["--", "/tmp/a.wav"]);
  });

  it("builds the flags for both kinds of voice and keeps the text last", () => {
    const request = { text: "--not a flag", speaker: 9, speed: 1.2, out: "/tmp/o.wav" };
    expect(
      speechArgs(
        { kind: "vits", model: "/v/model.onnx", tokens: "/v/tokens.txt", threads: 4 },
        request,
      ),
    ).toEqual([
      "--num-threads=4",
      "--tts-max-num-sentences=1",
      "--sid=9",
      "--speed=1.2",
      "--output-filename=/tmp/o.wav",
      "--vits-model=/v/model.onnx",
      "--vits-tokens=/v/tokens.txt",
      "--",
      "--not a flag",
    ]);
    expect(
      speechArgs(
        {
          kind: "kokoro",
          model: "/k/model.int8.onnx",
          voices: "/k/voices.bin",
          tokens: "/k/tokens.txt",
          lexicon: "/k/lexicon-us-en.txt",
          threads: 4,
        },
        request,
      ),
    ).toEqual([
      "--num-threads=4",
      "--tts-max-num-sentences=1",
      "--sid=9",
      "--speed=1.2",
      "--output-filename=/tmp/o.wav",
      "--kokoro-model=/k/model.int8.onnx",
      "--kokoro-voices=/k/voices.bin",
      "--kokoro-tokens=/k/tokens.txt",
      "--kokoro-lexicon=/k/lexicon-us-en.txt",
      "--",
      "--not a flag",
    ]);
  });

  it("reads the recognised text from the program's output", () => {
    expect(recognisedText(`${REAL_LINE}\n`)).toBe("Please send the report.");
    expect(recognisedText(`Creating recognizer ...\r\n${REAL_LINE}\r\nDone!\r\n`)).toBe(
      "Please send the report.",
    );
    expect(recognisedText('{"text": " কোটেশন পাঠাও ", "tokens": []}')).toBe("কোটেশন পাঠাও");
    expect(recognisedText('{"lang": "", "text": "", "tokens": []}')).toBe("");
    // The last result wins when the log holds more than one JSON line.
    expect(recognisedText('{"text": "first"}\n{"note": 1}\n{"text": "second"}\n')).toBe("second");
  });

  it("still finds the text when the output is not clean JSON", () => {
    // A raw line break inside the text, and a token list cut short.
    expect(recognisedText('{"lang": "", "text": "line one\nline two", "tokens":["a", "b')).toBe(
      "line one\nline two",
    );
    expect(recognisedText('{"text": "say \\"hello\\" now", "tokens": [bad]}')).toBe(
      'say "hello" now',
    );
    expect(recognisedText("")).toBeNull();
    expect(recognisedText("Started\nDone!\n")).toBeNull();
    expect(recognisedText('{"lang": "en"}\n')).toBeNull();
  });

  it("picks the line that says what went wrong", () => {
    const log = [
      "/Users/runner/work/x/csrc/parse-options.cc:Read:374 './bin/sherpa-onnx-offline' --tokens=nope.txt",
      "",
      "OfflineRecognizerConfig(feat_config=FeatureExtractorConfig(sampling_rate=16000))",
      "/Users/runner/work/x/csrc/offline-model-config.cc:Validate:105 tokens: 'nope.txt' does not exist",
      "Errors in config!",
    ].join("\n");
    expect(engineErrorLine(log)).toBe("tokens: 'nope.txt' does not exist");
    expect(engineErrorLine("dyld[12]: Library not loaded: @rpath/libonnxruntime.dylib\n")).toBe(
      "dyld[12]: Library not loaded: @rpath/libonnxruntime.dylib",
    );
    expect(engineErrorLine("")).toBe("");
    expect(engineErrorLine(`x.cc:Run:1 ${"y".repeat(500)}`).length).toBe(240);
  });
});

describe("MacVoiceHost", () => {
  const setup = {
    kind: "nemo-ctc" as const,
    model: "/m/model.onnx",
    tokens: "/m/t.txt",
    threads: 4,
  };

  it("gives up on a request that takes too long", async () => {
    const folder = await tempFolder();
    const host = new MacVoiceHost({
      engineDir: join(folder, "engine"),
      tmpDir: join(folder, "tmp"),
      run: hangingRunner,
      timeoutMs: 30,
    });
    await expect(host.transcribe(setup, new Float32Array(16_000))).rejects.toThrow(/took too long/);
    expect(await readdir(join(folder, "tmp"))).toEqual([]);
  });

  it("runs one request at a time and stops waiting ones too", async () => {
    const folder = await tempFolder();
    let running = 0;
    let most = 0;
    const run: ProgramRunner = async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return heard("ok");
    };
    const host = new MacVoiceHost({ engineDir: folder, tmpDir: join(folder, "tmp"), run });
    const clip = new Float32Array(16_000);
    expect(
      await Promise.all([
        host.transcribe(setup, clip),
        host.transcribe(setup, clip),
        host.transcribe(setup, clip),
      ]),
    ).toEqual(["ok", "ok", "ok"]);
    expect(most).toBe(1);

    const stuck = new MacVoiceHost({
      engineDir: folder,
      tmpDir: join(folder, "tmp"),
      run: hangingRunner,
    });
    const first = stuck.transcribe(setup, clip);
    const second = stuck.transcribe(setup, clip);
    const results = Promise.allSettled([first, second]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await stuck.stop();
    for (const result of await results) {
      expect(result.status).toBe("rejected");
      expect(String((result as PromiseRejectedResult).reason)).toMatch(/voice engine stopped/);
    }
    // The host still works after a stop.
    const again = new MacVoiceHost({ engineDir: folder, tmpDir: join(folder, "tmp"), run });
    expect(await again.transcribe(setup, clip)).toBe("ok");
  });
});

describe("VoiceService on a Mac", () => {
  /** A voice folder that looks as if the engine and these models were downloaded already. */
  async function macService(options: {
    models: string[];
    run?: ProgramRunner;
    arch?: "arm64" | "x64";
    engine?: boolean;
    fetchImpl?: typeof fetch;
  }) {
    const folder = await tempFolder();
    const arch = options.arch ?? "arm64";
    const engineDir = join(folder, "voice", "engine", `${SHERPA_VERSION}-mac-${arch}`);
    if (options.engine !== false) {
      await mkdir(engineDir, { recursive: true });
      await writeFile(join(engineDir, "ready.json"), "{}");
    }
    for (const id of options.models) {
      await mkdir(join(folder, "voice", "models", id), { recursive: true });
      await writeFile(join(folder, "voice", "models", id, "ready.json"), "{}");
    }
    const calls: Call[] = [];
    const fetched: string[] = [];
    const service = new VoiceService({
      userDataPath: folder,
      platform: "darwin",
      arch,
      fetchImpl:
        options.fetchImpl ??
        ((async (url: string) => {
          fetched.push(String(url));
          return new Response("not the real file");
        }) as unknown as typeof fetch),
      runProgram: async (file, args, run) => {
        calls.push({ file, args });
        return (options.run ?? (async () => heard("send the quote")))(file, args, run);
      },
    });
    await service.initialize();
    const modelDir = (id: string) => join(folder, "voice", "models", id);
    return { service, calls, fetched, folder, engineDir, modelDir };
  }

  it("offers every model and shows the size of the Mac engine for the chip", async () => {
    for (const arch of ["arm64", "x64"] as const) {
      const { service } = await macService({ models: [], arch });
      const state = service.getState();
      expect(state.models.map((model) => model.id)).toEqual(VOICE_MODELS.map((model) => model.id));
      expect(state.engineSizeBytes).toBe(MAC_VOICE_ENGINE[arch].size);
      expect(state.engineInstalled).toBe(true);
    }
  });

  it("transcribes with a CTC model through the dictation program", async () => {
    let wav: Buffer | null = null;
    const { service, calls, engineDir, modelDir, folder } = await macService({
      models: ["english-fast"],
      run: async (_file, args) => {
        wav = await readFile(args.at(-1) ?? "");
        return heard(" send the quote ");
      },
    });
    await service.setSettings({ dictationModel: "english-fast" });
    const samples = new Float32Array(16_000).fill(0.25);
    expect(await service.transcribe(samples)).toEqual({
      text: "Send the quote",
      modelId: "english-fast",
    });
    expect(calls).toHaveLength(1);
    const call = calls[0] as Call;
    expect(call.file).toBe(join(engineDir, "bin", "sherpa-onnx-offline"));
    const clip = call.args.at(-1) ?? "";
    expect(call.args).toEqual([
      `--tokens=${join(modelDir("english-fast"), "tokens.txt")}`,
      "--num-threads=4",
      `--nemo-ctc-model=${join(modelDir("english-fast"), "model.int8.onnx")}`,
      "--",
      clip,
    ]);
    expect(clip.startsWith(join(folder, "voice", "tmp"))).toBe(true);
    expect(clip.endsWith(".wav")).toBe(true);
    // The program got a real WAV of the whole clip, and the file is gone afterwards.
    const written = wav as unknown as Buffer;
    expect(written.length).toBe(44 + 16_000 * 2);
    expect(written.readUInt32LE(24)).toBe(16_000);
    expect(written.readInt16LE(44)).toBe(Math.round(0.25 * 32_767));
    expect(await readdir(join(folder, "voice", "tmp"))).toEqual([]);
  });

  it("does not start the engine for a clip too short to hold a word", async () => {
    const { service, calls } = await macService({ models: ["english-fast"] });
    await service.setSettings({ dictationModel: "english-fast" });
    expect(await service.transcribe(new Float32Array(800))).toEqual({
      text: "",
      modelId: "english-fast",
    });
    expect(calls).toHaveLength(0);
  });

  it("passes the Whisper language the same way Windows does", async () => {
    const { service, calls, modelDir } = await macService({
      models: ["hinglish-swift", "whisper-turbo"],
      run: async () => heard("Quote bhejo."),
    });
    const clip = new Float32Array(16_000);
    await service.setSettings({ dictationModel: "hinglish-swift" });
    expect((await service.transcribe(clip)).text).toBe("Quote bhejo.");
    const swift = (calls[0] as Call).args;
    expect(flag(swift, "whisper-encoder")).toBe(
      join(modelDir("hinglish-swift"), "encoder.int8.onnx"),
    );
    expect(flag(swift, "whisper-decoder")).toBe(
      join(modelDir("hinglish-swift"), "decoder.int8.onnx"),
    );
    expect(flag(swift, "tokens")).toBe(join(modelDir("hinglish-swift"), "tokens.txt"));
    expect(flag(swift, "whisper-language")).toBe("hi");
    expect(flag(swift, "whisper-task")).toBe("transcribe");
    expect(flag(swift, "whisper-tail-paddings")).toBe("-1");
    expect(swift.some((arg) => arg.startsWith("--nemo-ctc-model"))).toBe(false);

    await service.setSettings({ dictationModel: "whisper-turbo" });
    await service.transcribe(clip);
    expect(flag((calls[1] as Call).args, "whisper-language")).toBeUndefined();
    await service.setSettings({ dictationLanguage: "bn" });
    await service.transcribe(clip);
    expect(flag((calls[2] as Call).args, "whisper-language")).toBe("bn");
  });

  it("reads English aloud with Kokoro and returns the WAV the program wrote", async () => {
    const sound = encodeWav(new Float32Array(2_400).fill(0.1), 24_000);
    const { service, calls, engineDir, modelDir, folder } = await macService({
      models: ["kokoro-english"],
      run: async (_file, args) => {
        await writeFile(flag(args, "output-filename") ?? "", sound);
        return { code: 0, stdout: "", stderr: "Saved\n" };
      },
    });
    await service.setSettings({ speed: 1.2 });
    const wav = await service.speak("**Your report** is ready.");
    expect(Buffer.from(wav as Uint8Array).equals(sound)).toBe(true);
    const call = calls[0] as Call;
    expect(call.file).toBe(join(engineDir, "bin", "sherpa-onnx-offline-tts"));
    const dir = modelDir("kokoro-english");
    expect(call.args).toEqual([
      "--num-threads=4",
      "--tts-max-num-sentences=1",
      "--sid=3",
      "--speed=1.2",
      `--output-filename=${flag(call.args, "output-filename")}`,
      `--kokoro-model=${join(dir, "model.int8.onnx")}`,
      `--kokoro-voices=${join(dir, "voices.bin")}`,
      `--kokoro-tokens=${join(dir, "tokens.txt")}`,
      `--kokoro-lexicon=${join(dir, "lexicon-us-en.txt")}`,
      "--",
      "Your report is ready.",
    ]);
    expect(await readdir(join(folder, "voice", "tmp"))).toEqual([]);
  });

  it("reads Hindi aloud with the Indian voice and the chosen speaker", async () => {
    const { service, calls, modelDir } = await macService({
      models: ["rasa-indic", "kokoro-english"],
      run: async (_file, args) => {
        await writeFile(
          flag(args, "output-filename") ?? "",
          encodeWav(new Float32Array(160), 16_000),
        );
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    await service.speak("आपकी रिपोर्ट तैयार है।");
    const first = (calls[0] as Call).args;
    expect(flag(first, "vits-model")).toBe(join(modelDir("rasa-indic"), "model.onnx"));
    expect(flag(first, "vits-tokens")).toBe(join(modelDir("rasa-indic"), "tokens.txt"));
    expect(flag(first, "sid")).toBe("2");
    expect(flag(first, "speed")).toBe("1");
    expect(first.some((arg) => arg.startsWith("--kokoro"))).toBe(false);
    // The closing mark is dropped for this voice, exactly as on Windows.
    expect(first.slice(-2)).toEqual(["--", "आपकी रिपोर्ट तैयार है"]);

    await service.setSettings({ speakers: { hi: 9 } });
    await service.speak("नमस्ते");
    expect(flag((calls[1] as Call).args, "sid")).toBe("9");
  });

  it("returns null when no downloaded voice fits the text", async () => {
    const { service, calls } = await macService({ models: ["kokoro-english"] });
    expect(await service.speak("নমস্কার")).toBeNull();
    expect(await service.speak("```js\ncode only\n```")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("says what the engine reported when the program fails", async () => {
    const { service, folder } = await macService({
      models: ["english-fast"],
      run: async () => ({
        code: 127,
        stdout: "",
        stderr:
          "/x/csrc/parse-options.cc:Read:374 './sherpa-onnx-offline' --tokens=t.txt\n" +
          "/x/csrc/offline-model-config.cc:Validate:105 tokens: 't.txt' does not exist\nErrors in config!\n",
      }),
    });
    await service.setSettings({ dictationModel: "english-fast" });
    await expect(service.transcribe(new Float32Array(16_000))).rejects.toThrow(
      "The voice engine failed (code 127). tokens: 't.txt' does not exist",
    );
    expect(await readdir(join(folder, "voice", "tmp"))).toEqual([]);
  });

  it("explains a program that cannot start, crashes, or prints no result", async () => {
    const clip = new Float32Array(16_000);
    const missing = await macService({
      models: ["english-fast"],
      run: async () => {
        throw Object.assign(new Error("spawn sherpa-onnx-offline ENOENT"), { code: "ENOENT" });
      },
    });
    await missing.service.setSettings({ dictationModel: "english-fast" });
    await expect(missing.service.transcribe(clip)).rejects.toThrow(
      /^The voice engine could not start\. spawn sherpa-onnx-offline ENOENT/,
    );

    const crashed = await macService({
      models: ["english-fast"],
      run: async () => ({ code: null, stdout: "", stderr: "libc++abi: terminating\n" }),
    });
    await crashed.service.setSettings({ dictationModel: "english-fast" });
    await expect(crashed.service.transcribe(clip)).rejects.toThrow(
      "The voice engine failed (code ?). libc++abi: terminating",
    );

    const silent = await macService({
      models: ["english-fast"],
      run: async () => ({
        code: 0,
        stdout: "Started\nDone!\n",
        stderr: "Elapsed seconds: 0.2 s\n",
      }),
    });
    await silent.service.setSettings({ dictationModel: "english-fast" });
    await expect(silent.service.transcribe(clip)).rejects.toThrow(/gave no text/);
  });

  it("stops a running request when a model is removed or the app closes", async () => {
    const first = await macService({ models: ["english-fast", "indic-hi"], run: hangingRunner });
    await first.service.setSettings({ dictationModel: "english-fast" });
    const pending = first.service.transcribe(new Float32Array(16_000));
    const outcome = pending.catch((error: Error) => error.message);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const state = await first.service.remove("english-fast");
    expect(await outcome).toBe("The voice engine stopped.");
    expect(state.models.find((model) => model.id === "english-fast")?.installed).toBe(false);
    // Dictation moves to the model that is still there.
    expect(state.settings.dictationModel).toBe("indic-hi");
    expect(await readdir(join(first.folder, "voice", "tmp"))).toEqual([]);

    const second = await macService({ models: ["english-fast"], run: hangingRunner });
    await second.service.setSettings({ dictationModel: "english-fast" });
    const closing = second.service
      .transcribe(new Float32Array(16_000))
      .catch((error: Error) => error.message);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await second.service.dispose();
    expect(await closing).toBe("The voice engine stopped.");
  });

  it("downloads the engine built for the chip, and fetches it again when it is missing", async () => {
    for (const arch of ["arm64", "x64"] as const) {
      // Models are there (say, moved from another Mac) but the engine for this chip is not.
      const { service, fetched, calls } = await macService({
        models: ["english-fast"],
        arch,
        engine: false,
      });
      expect(service.getState().engineInstalled).toBe(false);
      await service.setSettings({ dictationModel: "english-fast" });
      await expect(service.transcribe(new Float32Array(16_000))).rejects.toThrow(/damaged/);
      expect(fetched).toEqual([MAC_VOICE_ENGINE[arch].url]);
      expect(fetched[0]).toContain(`osx-${arch}-shared.tar.bz2`);
      expect(calls).toHaveLength(0);
      expect(service.getState().engineInstalled).toBe(false);
    }
  });

  it("rejects a damaged engine download and leaves nothing half-installed", async () => {
    const { service, fetched, folder } = await macService({ models: [], engine: false });
    const finished = new Promise<void>((resolve) =>
      service.on("state", (state: VoiceState) => {
        if (state.models.find((model) => model.id === "indic-hi")?.phase === "failed") resolve();
      }),
    );
    await service.install("indic-hi");
    await finished;
    const hindi = service.getState().models.find((model) => model.id === "indic-hi");
    expect(hindi?.installed).toBe(false);
    expect(hindi?.message).toMatch(/damaged/);
    expect(fetched).toEqual([MAC_VOICE_ENGINE.arm64.url]);
    // Only the work folder may be left; it is wiped at the next try.
    const engines = await readdir(join(folder, "voice", "engine")).catch(() => []);
    expect(engines.filter((name) => !name.endsWith(".partial"))).toEqual([]);
    expect(service.getState().engineInstalled).toBe(false);
    expect(await readdir(join(folder, "voice", "models"))).toEqual([]);
  });

  it("cancels a download in progress", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const stop = () =>
          reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) stop();
        else init?.signal?.addEventListener("abort", stop, { once: true });
      })) as unknown as typeof fetch;
    const { service, folder } = await macService({ models: [], engine: false, fetchImpl });
    const started = await service.install("indic-hi");
    expect(started.models.find((model) => model.id === "indic-hi")?.phase).toBe("downloading");
    const idle = new Promise<void>((resolve) =>
      service.on("state", (state: VoiceState) => {
        if (state.models.find((model) => model.id === "indic-hi")?.phase === "idle") resolve();
      }),
    );
    await service.cancel("indic-hi");
    await idle;
    const hindi = service.getState().models.find((model) => model.id === "indic-hi");
    expect(hindi?.installed).toBe(false);
    expect(hindi?.message).toBeNull();
    expect(await readdir(join(folder, "voice", "models"))).toEqual([]);
  });
});

describe("VoiceService on other computers", () => {
  it("keeps the Windows engine size and never repairs the engine on its own", async () => {
    const folder = await tempFolder();
    await mkdir(join(folder, "voice", "models", "english-fast"), { recursive: true });
    await writeFile(join(folder, "voice", "models", "english-fast", "ready.json"), "{}");
    let fetches = 0;
    const service = new VoiceService({
      userDataPath: folder,
      platform: "win32",
      arch: "x64",
      fetchImpl: (async () => {
        fetches += 1;
        return new Response("x");
      }) as unknown as typeof fetch,
    });
    await service.initialize();
    expect(service.getState().engineSizeBytes).toBe(
      VOICE_ENGINE.native.size + VOICE_ENGINE.binding.size,
    );
    expect(service.getState().models).toHaveLength(VOICE_MODELS.length);
    await service.setSettings({ dictationModel: "english-fast" });
    await expect(service.transcribe(new Float32Array(16_000))).rejects.toThrow(
      "The voice engine is not downloaded yet.",
    );
    expect(fetches).toBe(0);
    await service.dispose();
  });

  it("offers no models and refuses downloads where there is no engine", async () => {
    for (const [platform, arch] of [
      ["linux", "x64"],
      ["darwin", "ia32"],
    ] as const) {
      let fetches = 0;
      const service = new VoiceService({
        userDataPath: await tempFolder(),
        platform,
        arch,
        fetchImpl: (async () => {
          fetches += 1;
          return new Response("x");
        }) as unknown as typeof fetch,
      });
      await service.initialize();
      const state = service.getState();
      expect(state.models).toEqual([]);
      expect(state.engineSizeBytes).toBe(0);
      expect(state.engineInstalled).toBe(false);
      await expect(service.install("indic-hi")).rejects.toThrow(
        "Voice typing models do not work on this computer yet. Voice notes work here.",
      );
      await expect(service.transcribe(new Float32Array(16_000))).rejects.toThrow(/Download/);
      expect(await service.speak("Hello there")).toBeNull();
      // Settings still save, so read-aloud choices are kept for later.
      expect((await service.setSettings({ readAloud: true })).settings.readAloud).toBe(true);
      expect(fetches).toBe(0);
      await service.dispose();
    }
  });
});
