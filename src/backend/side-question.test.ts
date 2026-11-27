import { describe, expect, it, vi } from "vitest";
import type { HomeRunner } from "./home-understand";
import {
  answerSideQuestion,
  type SideQuestionInput,
  sideQuestionPrompt,
  tidyAnswer,
} from "./side-question";

const input: SideQuestionInput = {
  question: "What is the GST rate on stationery?",
  coworkerName: "Mitra",
  coworkerRole: "Accounts",
  job: "Make the invoice for Sharma Traders",
  recent: [
    { from: "owner", text: "Make the invoice for Sharma Traders" },
    { from: "coworker", text: "I understood: an invoice for Sharma Traders." },
  ],
  language: "Hindi",
};

describe("sideQuestionPrompt", () => {
  it("carries the job, the chat and the question, and forbids tools", () => {
    const prompt = sideQuestionPrompt(input);
    expect(prompt).toContain("Do not use any tool");
    expect(prompt).toContain("Mitra (Accounts)");
    expect(prompt).toContain("Owner: Make the invoice for Sharma Traders");
    expect(prompt).toContain("Mitra: I understood");
    expect(prompt).toContain("in Hindi)");
    expect(prompt.endsWith("What is the GST rate on stationery?")).toBe(true);
  });

  it("keeps only the last few messages and cuts very long ones", () => {
    const recent = Array.from({ length: 30 }, (_, index) => ({
      from: "owner" as const,
      text: `message ${index} ${"x".repeat(2_000)}`,
    }));
    const prompt = sideQuestionPrompt({ ...input, recent });
    expect(prompt).not.toContain("message 0 ");
    expect(prompt).toContain("message 29 ");
    expect(prompt.length).toBeLessThan(12_000);
  });
});

describe("answerSideQuestion", () => {
  it("returns the tidied answer", async () => {
    const run: HomeRunner = async () =>
      "\u001b[0m\n  Stationery is usually taxed at 12% or 18%.\n\n\n\nCheck the HSN code.  \n";
    await expect(answerSideQuestion(input, run)).resolves.toBe(
      "Stationery is usually taxed at 12% or 18%.\n\nCheck the HSN code.",
    );
  });

  it("tries the second model when the first fails, and gives up quietly after that", async () => {
    const run = vi.fn<HomeRunner>(async (model) => {
      if (model === "a") throw new Error("limit");
      return model === "b" ? "An answer." : "never";
    });
    await expect(answerSideQuestion(input, run, { models: ["a", "b", "c"] })).resolves.toBe(
      "An answer.",
    );
    const failing: HomeRunner = async () => {
      throw new Error("down");
    };
    await expect(answerSideQuestion(input, failing, { models: ["a", "b"] })).resolves.toBeNull();
  });

  it("does not call the AI for an empty question or a question already overtaken", async () => {
    const run = vi.fn<HomeRunner>(async () => "x");
    await expect(answerSideQuestion({ ...input, question: "  " }, run)).resolves.toBeNull();
    const stop = new AbortController();
    stop.abort();
    await expect(answerSideQuestion(input, run, { signal: stop.signal })).resolves.toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("stops waiting for a model that is too slow", async () => {
    const run: HomeRunner = (_model, _prompt, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("stopped")));
      });
    await expect(
      answerSideQuestion(input, run, { models: ["slow"], timeoutMs: 20 }),
    ).resolves.toBeNull();
  });
});

describe("tidyAnswer", () => {
  it("is null for an empty reply", () => {
    expect(tidyAnswer("  \n ")).toBeNull();
  });
});
