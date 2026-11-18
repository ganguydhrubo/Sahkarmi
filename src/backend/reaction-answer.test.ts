import { describe, expect, it } from "vitest";
import type { ConversationMessage } from "../shared/ipc";
import { asksTheOwner, REACTION_NO, REACTION_YES, reactionAnswer } from "./reaction-answer";

const message = (id: string, author: ConversationMessage["author"], text: string) =>
  ({ id, author, text, createdAt: "2026-11-18T10:00:00Z" }) as ConversationMessage;

describe("a reaction that answers a coworker's question", () => {
  const chat = [
    message("u1", "user", "Make the Diwali offer message"),
    message(
      "a1",
      "assistant",
      "Here is the message for 40 customers.\n\n**Shall I send it on WhatsApp?**",
    ),
  ];

  it("turns a thumbs-up into yes and a thumbs-down into no", () => {
    expect(reactionAnswer(chat, "a1", "👍")).toBe(REACTION_YES);
    expect(reactionAnswer(chat, "a1", "✅")).toBe(REACTION_YES);
    expect(reactionAnswer(chat, "a1", "👎")).toBe(REACTION_NO);
  });

  it("leaves other reactions, removed reactions and statements as plain reactions", () => {
    expect(reactionAnswer(chat, "a1", "❤️")).toBeNull();
    expect(reactionAnswer(chat, "a1", null)).toBeNull();
    const statement = [message("a2", "assistant", "Done. The price list is saved.")];
    expect(reactionAnswer(statement, "a2", "👍")).toBeNull();
    expect(reactionAnswer(chat, "u1", "👍")).toBeNull();
  });

  it("does nothing once the owner has replied or the coworker moved on", () => {
    expect(reactionAnswer([...chat, message("u2", "user", "Wait")], "a1", "👍")).toBeNull();
    expect(
      reactionAnswer([...chat, message("a3", "assistant", "Sent to 40 customers.")], "a1", "👍"),
    ).toBeNull();
  });

  it("knows a question even with markdown or a full-width mark at the end", () => {
    expect(asksTheOwner("Ready.\n*Should I file it now?*")).toBe(true);
    expect(asksTheOwner("ठीक है？")).toBe(true);
    expect(asksTheOwner("Is it ok? I sent it anyway.")).toBe(false);
  });
});
