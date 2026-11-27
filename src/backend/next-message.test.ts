import { describe, expect, it, vi } from "vitest";
import type { HomeRunner } from "./home-understand";
import {
  type NextMessageInput,
  nextMessagePrompt,
  suggestNextMessage,
  tidySuggestion,
} from "./side-question";

const input: NextMessageInput = {
  coworkerName: "Mitra",
  coworkerRole: "Accounts",
  recent: [
    { from: "owner", text: "Make the invoice for Sharma Traders" },
    { from: "coworker", text: "The invoice is ready. Shall I send it?" },
  ],
  language: "Bengali",
};

describe("the suggested next message", () => {
  it("asks for one short message in the owner's voice, with no tools", () => {
    const prompt = nextMessagePrompt(input);
    expect(prompt).toContain("Do not use any tool");
    expect(prompt).toContain("at most 12 words");
    expect(prompt).toContain("Mitra: The invoice is ready. Shall I send it?");
    expect(prompt).toContain("in Bengali)");
  });

  it("returns one clean line", async () => {
    const run: HomeRunner = async () => '\n  "Yes, send it to Sharma Traders."  \n';
    await expect(suggestNextMessage(input, run)).resolves.toBe("Yes, send it to Sharma Traders.");
  });

  it("says nothing when the AI has no clear next step, talks too long or fails", async () => {
    expect(tidySuggestion("NONE")).toBeNull();
    expect(tidySuggestion("none.")).toBeNull();
    expect(tidySuggestion("   ")).toBeNull();
    expect(tidySuggestion("word ".repeat(40))).toBeNull();
    const failing: HomeRunner = async () => {
      throw new Error("down");
    };
    await expect(suggestNextMessage(input, failing)).resolves.toBeNull();
  });

  it("asks only one model, and not at all before the coworker has answered", async () => {
    const run = vi.fn<HomeRunner>(async () => "Send it.");
    await suggestNextMessage(input, run, { models: ["a", "b", "c"] });
    expect(run.mock.calls.map((call) => call[0])).toEqual(["a"]);
    run.mockClear();
    await expect(
      suggestNextMessage({ ...input, recent: [{ from: "owner", text: "Hello" }] }, run),
    ).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("stops when overtaken by a newer chat state", async () => {
    const stop = new AbortController();
    stop.abort();
    const run = vi.fn<HomeRunner>(async () => "Send it.");
    await expect(suggestNextMessage(input, run, { signal: stop.signal })).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
