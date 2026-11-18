import { describe, expect, it } from "vitest";
import { understandFirstPrompt } from "./home-brain";

describe("Home's AI brain", () => {
  it("asks the AI to say what it understood first, and keeps the owner's words last", () => {
    const words = "dukan ka diwali offer post bana do, kal subah tak";
    const prompt = understandFirstPrompt(words, { canHandOver: true });
    expect(prompt).toContain("This is not from the owner.");
    expect(prompt).toContain('starts with the words for "I understood:"');
    expect(prompt).toContain("ask at most two short questions");
    expect(prompt).toContain("hand it to them with sahkarmi.send_message");
    expect(prompt).toContain("Never make up facts");
    expect(prompt.endsWith(`--- the owner's words ---\n${words}`)).toBe(true);
  });

  it("does not tell a coworker to pass the job on when it may not", () => {
    const prompt = understandFirstPrompt("Make the list", { canHandOver: false });
    expect(prompt).not.toContain("send_message");
    expect(prompt).toContain("3. Otherwise do the job.");
  });
});
