import { describe, expect, it } from "vitest";
import { defaultSpokenForEnglish, SPOKEN_CHOICES } from "./VoiceRecorder";

describe("voice typing languages", () => {
  it("offers every app language: 3 with their own models and 14 through the on-PC model", () => {
    const codes = SPOKEN_CHOICES.map((choice) => choice.code);
    for (const code of ["en", "hi", "bn"]) expect(codes).toContain(code);
    const world = SPOKEN_CHOICES.filter((choice) => choice.whisper);
    expect(world.map((choice) => choice.code).sort()).toEqual(
      ["ar", "de", "es", "fr", "he", "it", "ja", "ko", "nl", "pl", "pt", "ru", "tr", "zh"].sort(),
    );
    // Each one tells the model which language to expect.
    for (const choice of world) expect(choice.whisper).toBe(choice.code);
  });

  it("with the app in English, speaks Hinglish in India and English elsewhere", () => {
    expect(defaultSpokenForEnglish("en-IN")).toBe("hi-en");
    expect(defaultSpokenForEnglish("hi-IN")).toBe("hi-en");
    expect(defaultSpokenForEnglish("en-US")).toBe("en");
    expect(defaultSpokenForEnglish("de-DE")).toBe("en");
    expect(defaultSpokenForEnglish(undefined)).toBe("en");
  });
});
