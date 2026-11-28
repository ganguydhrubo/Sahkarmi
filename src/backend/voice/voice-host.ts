// What every voice engine host can do. Windows keeps one helper process with the models in
// memory (voice-windows-host.ts); a Mac runs the engine's own programs (voice-mac-host.ts).

/** One request may take this long before it is given up. */
export const REQUEST_TIMEOUT_MS = 180_000;

/** How a dictation model is loaded. Every path is a full path on this computer. */
export type DictationSetup =
  | { kind: "nemo-ctc"; model: string; tokens: string; threads: number }
  | {
      kind: "whisper";
      encoder: string;
      decoder: string;
      tokens: string;
      /** Empty lets Whisper find the language itself. */
      language: string;
      threads: number;
    };

/** How a read-aloud voice is loaded. Every path is a full path on this computer. */
export type SpeechSetup =
  | { kind: "vits"; model: string; tokens: string; threads: number }
  | {
      kind: "kokoro";
      model: string;
      voices: string;
      tokens: string;
      lexicon: string;
      threads: number;
    };

export interface VoiceHost {
  /** 16 kHz mono samples in; the words the engine heard out. */
  transcribe(setup: DictationSetup, samples: Float32Array): Promise<string>;
  /** Returns the spoken text as a WAV file. */
  speak(setup: SpeechSetup, text: string, speaker: number, speed: number): Promise<Uint8Array>;
  /** Stops any work in progress and lets go of the model files. */
  stop(): Promise<void>;
}
