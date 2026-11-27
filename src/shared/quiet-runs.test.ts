import { describe, expect, it } from "vitest";
import {
  isAutomaticRun,
  isQuietReply,
  NOTHING_TO_REPORT,
  QUIET_RUN_INSTRUCTION,
  withoutQuietMarker,
} from "./quiet-runs";

describe("quiet runs", () => {
  it("knows schedule and routine messages", () => {
    expect(isAutomaticRun("schedule", "anything")).toBe(true);
    expect(isAutomaticRun("routine", "anything")).toBe(true);
    expect(isAutomaticRun(undefined, "[Scheduled task] Check new orders")).toBe(true);
    expect(isAutomaticRun(undefined, '[Routine "Morning" · step 1/2] Check mail')).toBe(true);
    expect(isAutomaticRun("owner", "Check new orders")).toBe(false);
  });

  it("finds the marker only on the last line", () => {
    expect(isQuietReply(`No new orders since yesterday.\n${NOTHING_TO_REPORT}`)).toBe(true);
    expect(isQuietReply(`No new orders.\n**${NOTHING_TO_REPORT}**\n`)).toBe(true);
    expect(isQuietReply(`${NOTHING_TO_REPORT} was not used.\nThree new orders.`)).toBe(false);
    expect(isQuietReply("Three new orders.")).toBe(false);
  });

  it("hides the marker from the owner", () => {
    expect(withoutQuietMarker(`No new orders.\r\n${NOTHING_TO_REPORT}`)).toBe("No new orders.");
    expect(withoutQuietMarker("Three new orders.")).toBe("Three new orders.");
    expect(QUIET_RUN_INSTRUCTION).toContain(NOTHING_TO_REPORT);
  });
});
