import { describe, expect, it } from "vitest";
import { startFirst } from "./start-order";

describe("startFirst", () => {
  it("starts the default AI first, then the ones the most coworkers use", () => {
    expect(
      startFirst(["codex", "claude", "opencode", "kimi"], "kimi", ["claude", "opencode", "claude"]),
    ).toEqual(["kimi", "claude", "opencode", "codex"]);
  });

  it("keeps the usual order when no coworker uses an AI yet", () => {
    expect(startFirst(["codex", "claude", "opencode"], "codex", [])).toEqual([
      "codex",
      "claude",
      "opencode",
    ]);
  });
});
