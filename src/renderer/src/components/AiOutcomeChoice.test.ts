import { describe, expect, it } from "vitest";
import { outcomeModels } from "./AiOutcomeChoice";

describe("Quick, Careful or Free", () => {
  it("uses the owner's paid AI for Quick and Careful, and a free AI for Free", () => {
    const all = outcomeModels(["codex", "claude", "opencode", "antigravity"], []);
    expect(all.quick).toBe("gpt-5.6-luna");
    expect(all.careful).toBe("claude-opus-5");
    expect(all.free).toBe("opencode-free");
    // Only ChatGPT connected: its own careful model.
    expect(outcomeModels(["codex", "opencode"], []).careful).toBe("gpt-5.6-sol");
  });

  it("offers nothing a connected AI cannot serve", () => {
    const freeOnly = outcomeModels(["opencode"], []);
    expect(freeOnly).toEqual({ quick: null, careful: null, free: "opencode-free" });
    expect(outcomeModels(["antigravity"], []).free).toBe("antigravity-default");
    expect(outcomeModels([], [])).toEqual({ quick: null, careful: null, free: null });
    // A model the account does not list is not offered.
    expect(outcomeModels(["codex"], [{ id: "gpt-5.6-terra" }]).quick).toBeNull();
  });
});
