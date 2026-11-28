// Real proof that voice typing and read-aloud work on this computer, with no Electron:
//   bun scripts/mac/voice-smoke.ts [--keep] [--dir=<folder>] [more model ids ...]
//
// It downloads the voice engine for this computer, the smallest English voice and the smallest
// dictation model that understands English (about 315 MB in all), reads a sentence aloud, checks
// the WAV, then types that same sound back and fails unless the words match. No model in the
// catalog ships a test recording, so the engine's own voice makes the test clip.
//
// Model ids given on the command line are tried as well, for example
//   bun scripts/mac/voice-smoke.ts english-fast rasa-indic
// which also covers the two other kinds of model (about 300 MB more).
// --dir keeps the downloads in a folder of your choice so a second run is quick.
// Made for the GitHub macOS runners (both chips); it runs on Windows too. Exit code 0 = all good.

import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  downloadSize,
  SHERPA_VERSION,
  VOICE_MODELS,
  type VoiceModel,
} from "../../src/backend/voice/voice-catalog";
import { VoiceService } from "../../src/backend/voice/voice-service";
import type { VoiceState } from "../../src/shared/ipc";

const SENTENCE = "Please send the report to the office before Monday morning.";
/** The typed text must hold the first word; the others are counted and shown. */
const EXPECTED_WORDS = ["report", "office", "monday", "morning"];
const HINDI_SENTENCE = "नमस्ते, आपकी रिपोर्ट तैयार है।";
const DOWNLOAD_LIMIT_MS = 20 * 60_000;

const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const extraIds = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const chosenDir = flags.find((flag) => flag.startsWith("--dir="))?.slice("--dir=".length);
const keep = flags.includes("--keep") || Boolean(chosenDir);

function log(message: string): void {
  console.log(`[voice-smoke] ${message}`);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function seconds(sinceMs: number): string {
  return `${((performance.now() - sinceMs) / 1_000).toFixed(1)} s`;
}

function understandsEnglish(model: VoiceModel): boolean {
  return model.languages.some((code) => code === "en" || code === "hi-en" || code === "auto");
}

function smallest<T extends VoiceModel>(models: T[]): T | undefined {
  return [...models].sort((a, b) => downloadSize(a) - downloadSize(b))[0];
}

interface Sound {
  sampleRate: number;
  seconds: number;
  /** Mono samples between -1 and 1. */
  samples: Float32Array;
}

/** Reads a WAV file (16-bit, or 32-bit float) and throws when it is not a sane one. */
function readWav(bytes: Uint8Array): Sound {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (data.length < 44 || data.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("The spoken reply is not a WAV file (no RIFF header).");
  }
  if (data.toString("ascii", 8, 12) !== "WAVE") throw new Error("The WAV header is damaged.");
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let body: Buffer | null = null;
  for (let offset = 12; offset + 8 <= data.length; ) {
    const name = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (name === "fmt ") {
      format = data.readUInt16LE(start);
      channels = data.readUInt16LE(start + 2);
      sampleRate = data.readUInt32LE(start + 4);
      bits = data.readUInt16LE(start + 14);
    } else if (name === "data") {
      body = data.subarray(start, Math.min(data.length, start + size));
    }
    offset = start + size + (size % 2);
  }
  if (!body || channels < 1 || sampleRate < 8_000 || sampleRate > 96_000) {
    throw new Error(`The WAV is not usable (channels ${channels}, rate ${sampleRate}).`);
  }
  const width = bits / 8;
  if (!((format === 1 && bits === 16) || (format === 3 && bits === 32))) {
    throw new Error(`The WAV has a sample format this test does not read (${format}/${bits}).`);
  }
  const frames = Math.floor(body.length / (width * channels));
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = (frame * channels + channel) * width;
      sum += format === 1 ? body.readInt16LE(at) / 32_768 : body.readFloatLE(at);
    }
    samples[frame] = sum / channels;
  }
  return { sampleRate, seconds: frames / sampleRate, samples };
}

/** Brings a sound to 16 kHz, the rate dictation takes: a light smoothing, then straight lines. */
function to16k(sound: Sound): Float32Array {
  if (sound.sampleRate === 16_000) return sound.samples;
  const input = sound.samples;
  const smooth = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const before = input[Math.max(0, index - 1)] ?? 0;
    const after = input[Math.min(input.length - 1, index + 1)] ?? 0;
    smooth[index] = 0.25 * before + 0.5 * (input[index] ?? 0) + 0.25 * after;
  }
  const step = sound.sampleRate / 16_000;
  const output = new Float32Array(Math.floor(input.length / step));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * step;
    const left = Math.floor(position);
    const mix = position - left;
    output[index] = (smooth[left] ?? 0) * (1 - mix) + (smooth[left + 1] ?? smooth[left] ?? 0) * mix;
  }
  return output;
}

function checkSpeech(wav: Uint8Array | null, minSeconds: number): Sound {
  if (!wav) throw new Error("Read-aloud returned nothing: no downloaded voice fits the text.");
  const sound = readWav(wav);
  let peak = 0;
  for (const sample of sound.samples) peak = Math.max(peak, Math.abs(sample));
  log(
    `  WAV: ${megabytes(wav.byteLength)}, ${sound.sampleRate} Hz, ` +
      `${sound.seconds.toFixed(2)} s, loudest sample ${peak.toFixed(2)}`,
  );
  if (sound.seconds < minSeconds) {
    throw new Error(`The spoken reply is too short (${sound.seconds.toFixed(2)} s).`);
  }
  if (peak < 0.02) throw new Error("The spoken reply is silent.");
  return sound;
}

async function main(): Promise<void> {
  const folder = chosenDir
    ? resolve(chosenDir)
    : await mkdtemp(join(tmpdir(), "sahkarmi-voice-smoke-"));
  log(
    `${process.platform} ${process.arch}, OS ${release()}, ${cpus()[0]?.model ?? "unknown chip"}`,
  );
  log(`engine ${SHERPA_VERSION}; working folder ${folder}`);

  const service = new VoiceService({ userDataPath: folder });
  await service.initialize();

  async function install(id: string): Promise<void> {
    const model = VOICE_MODELS.find((entry) => entry.id === id);
    if (!model) throw new Error(`"${id}" is not a model in the catalog.`);
    if (service.getState().models.length === 0) {
      throw new Error("This computer has no voice engine, so no model is offered.");
    }
    if (service.getState().models.find((entry) => entry.id === id)?.installed) {
      log(`${id}: already downloaded`);
      return;
    }
    const withEngine = service.getState().engineInstalled
      ? ""
      : ` + engine ${megabytes(service.getState().engineSizeBytes)}`;
    log(`${id}: downloading ${megabytes(downloadSize(model))}${withEngine} ...`);
    const started = performance.now();
    await new Promise<void>((done, fail) => {
      let lastShown = Date.now();
      const timer = setTimeout(
        () => finish(new Error(`${id}: the download took over 20 minutes.`)),
        DOWNLOAD_LIMIT_MS,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        service.off("state", onState);
        if (error) fail(error);
        else done();
      };
      const onState = (state: VoiceState) => {
        const info = state.models.find((entry) => entry.id === id);
        if (!info) return;
        if (info.installed) finish();
        else if (info.phase === "failed") {
          finish(new Error(`${id}: download failed: ${info.message ?? "no reason given"}`));
        } else if (Date.now() - lastShown > 10_000) {
          lastShown = Date.now();
          log(
            `  ${id}: ${Math.round((100 * info.receivedBytes) / info.sizeBytes)}% (${info.phase})`,
          );
        }
      };
      service.on("state", onState);
      service.install(id).then(onState, finish);
    });
    log(`${id}: ready in ${seconds(started)}`);
  }

  async function typeBack(id: string, clip: Float32Array, mustMatch: boolean): Promise<void> {
    await service.setSettings({ dictationModel: id });
    for (const round of ["first", "second"]) {
      const started = performance.now();
      const { text } = await service.transcribe(clip);
      log(`${id}: ${round} dictation took ${seconds(started)}: "${text}"`);
      if (!mustMatch) continue;
      const lower = text.toLowerCase();
      const found = EXPECTED_WORDS.filter((word) => lower.includes(word));
      if (!lower.includes(EXPECTED_WORDS[0] ?? "")) {
        throw new Error(`${id}: expected the word "${EXPECTED_WORDS[0]}" in "${text}".`);
      }
      log(`  matched ${found.length} of ${EXPECTED_WORDS.length} expected words`);
    }
  }

  try {
    const voice = smallest(
      VOICE_MODELS.filter((model) => model.type === "speech" && model.languages.includes("en")),
    );
    const dictation = smallest(
      VOICE_MODELS.filter((model) => model.type === "dictation" && understandsEnglish(model)),
    );
    if (!voice || !dictation) {
      throw new Error("The catalog needs one English voice and one English dictation model.");
    }
    const total =
      downloadSize(voice) + downloadSize(dictation) + service.getState().engineSizeBytes;
    log(
      `plan: voice ${voice.id}, dictation ${dictation.id}, about ${megabytes(total)} to download`,
    );

    // 1. Read aloud.
    await install(voice.id);
    let started = performance.now();
    const spoken = checkSpeech(await service.speak(SENTENCE), 1);
    log(`${voice.id}: first read-aloud took ${seconds(started)}`);
    started = performance.now();
    checkSpeech(await service.speak("The second sentence shows the usual speed."), 0.3);
    log(`${voice.id}: second read-aloud took ${seconds(started)}`);

    // 2. Voice typing, on the sentence just spoken.
    const clip = to16k(spoken);
    await install(dictation.id);
    await typeBack(dictation.id, clip, true);

    // 3. Anything else asked for on the command line.
    for (const id of extraIds) {
      const model = VOICE_MODELS.find((entry) => entry.id === id);
      if (!model) throw new Error(`"${id}" is not a model in the catalog.`);
      await install(id);
      if (model.type === "dictation") {
        await typeBack(id, clip, understandsEnglish(model));
      } else {
        const text = model.languages.includes("en") ? SENTENCE : HINDI_SENTENCE;
        started = performance.now();
        checkSpeech(await service.speak(text), 0.3);
        log(`${id}: read-aloud took ${seconds(started)}`);
      }
    }
    log("PASS: voice typing and read-aloud work on this computer.");
  } finally {
    await service.dispose();
    if (keep) log(`kept ${folder}`);
    else await rm(folder, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`[voice-smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
