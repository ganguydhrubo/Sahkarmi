import { describe, expect, it } from "vitest";
import { steerPrompt } from "./agent-service";

describe("Add to this task now (agents that cannot take a message mid-task)", () => {
  it("tells the coworker to carry on with the same task, using the new instruction", () => {
    const text = steerPrompt("Make the Diwali price list for all 40 items", "Use 12% GST, not 18%");
    expect(text).toContain(
      'You were in the middle of: "Make the Diwali price list for all 40 items"',
    );
    expect(text).toContain("carry on with that task from where you stopped");
    expect(text).toContain("Do not start over");
    expect(text.endsWith("Use 12% GST, not 18%")).toBe(true);
  });

  it("still works when the earlier request is not known", () => {
    const text = steerPrompt("", "Stop and send me what you have");
    expect(text).not.toContain("You were in the middle of");
    expect(text).toContain("Stop and send me what you have");
  });
});
