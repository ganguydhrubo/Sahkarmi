import { describe, expect, it } from "vitest";
import { parseQuickReplies, QUICK_REPLY_INSTRUCTION } from "./quick-replies";

describe("tap-to-answer choices", () => {
  it("takes the choices off the last line", () => {
    expect(
      parseQuickReplies("Shall I send the invoice today?\nCHOICES: Yes | No | Tomorrow"),
    ).toEqual({
      text: "Shall I send the invoice today?",
      choices: ["Yes", "No", "Tomorrow"],
    });
  });

  it("accepts bold marks and drops empty or repeated choices", () => {
    expect(parseQuickReplies("Pick one.\r\n**CHOICES: A |  | A | B**").choices).toEqual(["A", "B"]);
  });

  it("leaves ordinary replies alone", () => {
    const reply = "Done. CHOICES: were made yesterday.";
    expect(parseQuickReplies(reply)).toEqual({ text: reply, choices: [] });
    expect(parseQuickReplies("Question?\nCHOICES: Only one").choices).toEqual([]);
  });

  it("keeps at most six choices", () => {
    expect(parseQuickReplies("Q\nCHOICES: 1|2|3|4|5|6|7|8").choices).toHaveLength(6);
    expect(QUICK_REPLY_INSTRUCTION).toContain("CHOICES:");
  });
});
