import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMessage } from "../shared/ipc";
import { HiddenMessageStore } from "./hidden-messages";

function message(
  id: string,
  text: string,
  createdAt: string,
  extra: Partial<ConversationMessage> = {},
): ConversationMessage {
  return { id, author: "assistant", text, createdAt, status: "completed", ...extra };
}

describe("HiddenMessageStore", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sk-hidden-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const chat = [
    message("m1", "Hello", "2026-11-27T10:00:00.000Z", { author: "user" }),
    message("m2", "Here is the invoice", "2026-11-27T10:01:00.000Z", { turnId: "t1" }),
    message("m3", "Anything else?", "2026-11-27T10:02:00.000Z", { turnId: "t2" }),
  ];

  it("shows everything, as the same array, when nothing was removed", async () => {
    const store = new HiddenMessageStore(root);
    await store.load();
    expect(store.visible("bot", chat)).toBe(chat);
  });

  it("leaves out a removed message and keeps the rest, also after a restart", async () => {
    const store = new HiddenMessageStore(root);
    await store.hide("bot", chat[1]);
    expect(store.visible("bot", chat).map((item) => item.id)).toEqual(["m1", "m3"]);
    // Another coworker's chat is untouched.
    expect(store.visible("other", chat)).toBe(chat);

    const again = new HiddenMessageStore(root);
    await again.load();
    expect(again.visible("bot", chat).map((item) => item.id)).toEqual(["m1", "m3"]);
  });

  it("still knows a removed reply when it comes back with a new id", async () => {
    const store = new HiddenMessageStore(root);
    await store.hide("bot", chat[1]);
    const reread = [chat[0], { ...chat[1], id: "new-uuid" }, chat[2]];
    expect(store.visible("bot", reread).map((item) => item.id)).toEqual(["m1", "m3"]);
  });

  it("clears a chat: old messages go, new ones show", async () => {
    const store = new HiddenMessageStore(root);
    await store.hide("bot", chat[0]);
    await store.clearChat("bot", "2026-11-27T10:05:00.000Z");
    const later = message("m4", "A fresh start", "2026-11-27T10:06:00.000Z");
    expect(store.visible("bot", [...chat, later]).map((item) => item.id)).toEqual(["m4"]);
  });

  it("forgets a deleted coworker", async () => {
    const store = new HiddenMessageStore(root);
    await store.hide("bot", chat[1]);
    await store.forget("bot");
    expect(store.has("bot")).toBe(false);
    expect(store.visible("bot", chat)).toBe(chat);
  });
});
