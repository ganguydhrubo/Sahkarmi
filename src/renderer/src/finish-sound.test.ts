import { describe, expect, it } from "vitest";
import { playFinishSound } from "./finish-sound";

describe("playFinishSound", () => {
  it("never throws where there is no sound support, and does not repeat in a burst", () => {
    // The test page has no AudioContext: the call is quiet and says it did not play.
    expect(playFinishSound(10_000)).toBe(false);
    // A second coworker finishing within the quiet gap is skipped before any audio work.
    expect(playFinishSound(10_500)).toBe(false);
    expect(() => playFinishSound(20_000)).not.toThrow();
  });
});
