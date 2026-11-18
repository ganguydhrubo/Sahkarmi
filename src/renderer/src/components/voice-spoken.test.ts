import { describe, expect, it } from "vitest";
import { modelForSpoken, spokenForModel } from "./VoiceRecorder";

const models = [
  { id: "hinglish-swift", installed: true },
  { id: "indic-bn", installed: false },
  { id: "indic-hi", installed: false },
  { id: "english-fast", installed: false },
  { id: "whisper-turbo", installed: true },
];

describe("speak in: the right voice model for the language spoken", () => {
  it("offers the Bengali model for Bengali, never the Hinglish one", () => {
    expect(modelForSpoken("bn", models)?.id).toBe("indic-bn");
    expect(modelForSpoken("hi", models)?.id).toBe("indic-hi");
  });

  it("prefers a model already on this PC", () => {
    expect(modelForSpoken("en", models)?.id).toBe("whisper-turbo");
    expect(modelForSpoken("hi-en", models)?.id).toBe("hinglish-swift");
  });

  it("knows which language a model writes", () => {
    expect(spokenForModel("hinglish-swift")).toBe("hi-en");
    expect(spokenForModel("indic-bn")).toBe("bn");
    expect(spokenForModel("indic-ta")).toBeNull();
    expect(spokenForModel(null)).toBeNull();
  });
});
