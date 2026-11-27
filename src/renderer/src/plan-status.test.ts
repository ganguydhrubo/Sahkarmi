import { describe, expect, it } from "vitest";
import type { TurnPlan } from "../../shared/ipc";
import { planStatusLine } from "./plan-status";

const plan = (statuses: Array<"pending" | "in_progress" | "completed">): TurnPlan => ({
  turnId: "t1",
  explanation: null,
  steps: statuses.map((status, i) => ({ text: `Step text ${i + 1}`, status })),
});

describe("planStatusLine", () => {
  it("names the step being worked on", () => {
    expect(planStatusLine(plan(["completed", "in_progress", "pending", "pending"]))).toBe(
      "Step 2 of 4: Step text 2",
    );
  });

  it("falls back to the next waiting step", () => {
    expect(planStatusLine(plan(["completed", "pending"]))).toBe("Step 2 of 2: Step text 2");
  });

  it("is quiet with no plan or a finished one", () => {
    expect(planStatusLine(null)).toBeNull();
    expect(planStatusLine(plan([]))).toBeNull();
    expect(planStatusLine(plan(["completed", "completed"]))).toBeNull();
  });

  it("uses the given words", () => {
    expect(planStatusLine(plan(["in_progress"]), "धाप {step}/{total}: {text}")).toBe(
      "धाप 1/1: Step text 1",
    );
  });
});
