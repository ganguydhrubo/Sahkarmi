import { describe, expect, it, vi } from "vitest";
import {
  type HomeRunner,
  type HomeTeamMember,
  homePrompt,
  orderHomeModels,
  parseUnderstanding,
  understandJob,
} from "./home-understand";

const team: HomeTeamMember[] = [
  { id: "acc", name: "Mitra", role: "Accounts", busy: false },
  { id: "ceo", name: "Asha", role: "CEO", busy: true },
];

const good = JSON.stringify({
  understood: "Make a GST invoice for Sharma Traders.",
  coworkerIds: ["acc"],
  why: "Mitra does the accounts.",
  questions: ["Which items?", "What amount?", "Which date?", "One too many?"],
  plan: ["Ask for the items", "Make the invoice", "Show it", "Save it", "Extra step"],
});

describe("understandJob", () => {
  it("reads a good answer and keeps the limits", async () => {
    const run: HomeRunner = vi.fn(async () => `Here you go:\n${good}\n`);
    const result = await understandJob("make a GST invoice for Sharma Traders", team, run);
    expect(result?.understood).toBe("Make a GST invoice for Sharma Traders.");
    expect(result?.coworkerIds).toEqual(["acc"]);
    expect(result?.questions).toHaveLength(3);
    expect(result?.plan).toHaveLength(4);
  });

  it("returns null for an answer that is not JSON", async () => {
    const run: HomeRunner = async () => "Sorry, I cannot help with that.";
    expect(await understandJob("make a GST invoice", team, run, { models: ["a"] })).toBeNull();
  });

  it("drops a coworker that is not in the team", async () => {
    const run: HomeRunner = async () =>
      JSON.stringify({ understood: "Do it", coworkerIds: ["ghost", "ceo", "ceo"] });
    const result = await understandJob("make a GST invoice", team, run);
    expect(result?.coworkerIds).toEqual(["ceo"]);
  });

  it("gives up quietly when the model is too slow", async () => {
    const run: HomeRunner = (_model, _prompt, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("stopped")));
      });
    const result = await understandJob("make a GST invoice", team, run, {
      models: ["slow"],
      timeoutMs: 20,
    });
    expect(result).toBeNull();
  });

  it("tries the second model when the first one fails", async () => {
    const run = vi.fn<HomeRunner>(async (model) => {
      if (model === "first") throw new Error("Free usage limit reached");
      return good;
    });
    const result = await understandJob("make a GST invoice", team, run, {
      models: ["first", "second", "third"],
    });
    expect(result?.coworkerIds).toEqual(["acc"]);
    expect(run.mock.calls.map((call) => call[0])).toEqual(["first", "second"]);
  });

  it("does not call the AI for empty words or an empty team", async () => {
    const run = vi.fn<HomeRunner>(async () => good);
    expect(await understandJob("   ", team, run)).toBeNull();
    expect(await understandJob("make a GST invoice", [], run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("stops when the owner changed the words", async () => {
    const stop = new AbortController();
    stop.abort();
    const run = vi.fn<HomeRunner>(async () => good);
    expect(
      await understandJob("make a GST invoice", team, run, { signal: stop.signal }),
    ).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("parseUnderstanding", () => {
  it("needs the understood line", () => {
    expect(parseUnderstanding('{"coworkerIds":["acc"]}', team)).toBeNull();
    expect(parseUnderstanding("[1,2]", team)).toBeNull();
    expect(parseUnderstanding("{broken", team)).toBeNull();
  });
});

describe("homePrompt", () => {
  it("sends the team and the owner's words, and asks for the owner's language", () => {
    const prompt = homePrompt("GST bill banao", team, "Hindi");
    expect(prompt).toContain('"id":"acc"');
    expect(prompt).toContain('"state":"busy"');
    expect(prompt).toContain("in Hindi)");
    expect(prompt.endsWith("GST bill banao")).toBe(true);
  });
});

describe("orderHomeModels", () => {
  it("keeps only free models and puts quick ones first", () => {
    expect(
      orderHomeModels([
        "opencode/big-pickle",
        "opencode/iceman-free",
        "opencode/gpt-5",
        "opencode/hy4-flash-free",
      ]),
    ).toEqual(["opencode/hy4-flash-free", "opencode/iceman-free"]);
  });
});
