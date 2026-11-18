import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMessage } from "../shared/ipc";
import {
  AiSwitchStore,
  awayNote,
  DEFAULT_LIMIT_COOLDOWN_MS,
  friendlyAiName,
  LimitWatch,
  limitResetFromText,
  nextBackup,
  switchNote,
  withHandover,
} from "./ai-switch";

let counter = 0;
function message(
  author: ConversationMessage["author"],
  text: string,
  extra: Partial<ConversationMessage> = {},
): ConversationMessage {
  counter += 1;
  return {
    id: `m${counter}`,
    author,
    text,
    createdAt: new Date(1_700_000_000_000 + counter * 1_000).toISOString(),
    status: "completed",
    ...extra,
  };
}

describe("the hand-over note for a new AI", () => {
  it("gives the goal, what is done, the files and the next step", () => {
    const note = switchNote({
      from: "codex",
      to: "antigravity",
      reason: "limit",
      messages: [
        message("user", "Make the Diwali offer price list for my saree shop, in Excel"),
        message("assistant", "Reading the stock sheet", { itemType: "commentary" }),
        message("assistant", "", {
          itemType: "toolCall",
          tool: {
            name: "shell",
            kind: "command",
            status: "completed",
            input: "dir stock",
            output: "SECRET-TOOL-OUTPUT",
          },
        }),
        message("assistant", "The price list is ready with 42 sarees and a 10% Diwali offer.", {
          attachments: [
            {
              id: "a1",
              name: "Diwali-price-list.xlsx",
              size: 10,
              kind: "file",
              mimeType: "application/vnd.ms-excel",
              previewKind: "none",
              previewUrl: null,
            },
          ],
        }),
        message("user", "ok"),
        message("user", "Now add a GST column"),
      ],
    });
    expect(note).toContain("Hand-over note from Sahkarmi");
    expect(note).toContain("ChatGPT (Codex) could not carry on");
    expect(note).toContain("you (Google Antigravity)");
    // The goal is the latest real request, not "ok".
    expect(note).toContain("Goal: Now add a GST column");
    expect(note).toContain("Your last reply was: The price list is ready with 42 sarees");
    expect(note).toContain("Diwali-price-list.xlsx");
    expect(note).toContain("Next step: The owner's latest message has no answer yet");
    expect(note).toContain("Owner: Make the Diwali offer price list");
    // The steps already taken and the working notes go along; a tool's output never does.
    expect(note).toContain("- shell: dir stock (done)");
    expect(note).toContain("- Reading the stock sheet");
    expect(note).not.toContain("SECRET-TOOL-OUTPUT");
    expect(note).toContain(
      "Never generate, download or write again something that is already there",
    );
  });

  it("hands over a long job that was all tool work: plan, steps taken and files made", () => {
    // ChatGPT made the scenes, ran out of its limit mid-task and never replied in words.
    const note = switchNote({
      from: "codex",
      to: "claude",
      reason: "limit",
      messages: [
        message("user", "Make the 176 second animated Bengali folk song video from the brief"),
        message("assistant", "", {
          itemType: "toolCall",
          tool: {
            name: "Browser Act",
            kind: "browser",
            status: "completed",
            input: "Google Vids: Create scene 3 of 12",
            output: "page text ".repeat(500),
          },
        }),
        message("assistant", "", {
          itemType: "toolCall",
          status: "interrupted",
          tool: {
            name: "view_file",
            kind: "file",
            status: "running",
            input: "scenes/scene-03.mp4",
            output: null,
          },
        }),
      ],
      plan: {
        turnId: "t1",
        explanation: null,
        steps: [
          { text: "Audit the brief and existing assets", status: "completed" },
          { text: "Generate all animated scenes in Google Vids", status: "in_progress" },
          { text: "Verify the audio mix", status: "pending" },
        ],
      },
      files: ["C:/work/scenes/scene-03.mp4", "C:/work/scenes/scene-02.mp4"],
    });
    expect(note).toContain("- [done] Audit the brief and existing assets");
    expect(note).toContain("- [was being done] Generate all animated scenes in Google Vids");
    expect(note).toContain("- [not started] Verify the audio mix");
    expect(note).toContain("You had not replied to the owner yet.");
    expect(note).toContain("- Browser Act: Google Vids: Create scene 3 of 12 (done)");
    expect(note).toContain("- view_file: scenes/scene-03.mp4 (not finished)");
    expect(note).toContain("scene-02.mp4");
    expect(note).toContain(
      'Next step: Carry on with the plan from this step: "Generate all animated scenes in Google Vids"',
    );
    expect(note).not.toContain("page text page text");
    expect(note?.length).toBeLessThan(4_000);
  });

  it("says the owner chose the move, and carries the open steps of the plan", () => {
    const note = switchNote({
      from: "claude",
      to: "codex",
      reason: "owner",
      messages: [
        message("user", "Prepare the school fee reminder letters"),
        message("assistant", "Two of three letters are written."),
      ],
      plan: {
        turnId: "t1",
        explanation: null,
        steps: [
          { text: "Write class 5 letter", status: "completed" },
          { text: "Write class 6 letter", status: "in_progress" },
        ],
      },
    });
    expect(note).toContain("The owner moved this coworker from Claude to you (ChatGPT (Codex))");
    expect(note).toContain("- [done] Write class 5 letter");
    expect(note).toContain(
      'Next step: Carry on with the plan from this step: "Write class 6 letter"',
    );
  });

  it("is empty for a coworker that never spoke, and stays short for a long chat", () => {
    expect(switchNote({ from: "codex", to: "claude", reason: "owner", messages: [] })).toBeNull();
    const long = Array.from({ length: 200 }, (_, index) =>
      message(index % 2 ? "assistant" : "user", `Message ${index} ${"word ".repeat(400)}`),
    );
    const note = switchNote({ from: "codex", to: "claude", reason: "owner", messages: long });
    expect(note?.length).toBeLessThan(9_000);
    expect(note).toContain("Message 199");
    expect(note).not.toContain("Message 100 ");
  });

  it("tells a returning AI what was said while another AI covered", () => {
    expect(awayNote([message("user", "Add GST please")], "opencode")).toBeNull();
    const note = awayNote(
      [message("user", "Add GST please"), message("assistant", "GST column added at 5%.")],
      "opencode",
    );
    expect(note).toContain("OpenCode (free) covered for you");
    expect(note).toContain("The covering AI: GST column added at 5%.");
    expect(withHandover(note ?? "", "Next?")).toMatch(/--- the message to answer now ---\nNext\?$/);
  });

  it("uses the names owners use", () => {
    expect(friendlyAiName("codex")).toBe("ChatGPT");
    expect(friendlyAiName("antigravity")).toBe("Gemini");
    expect(friendlyAiName("opencode")).toBe("the free AI");
    expect(friendlyAiName("claude")).toBe("Claude");
  });
});

describe("the owner's backup order", () => {
  const ready = () => true;

  it("moves to the next AI in the order and wraps around", () => {
    const order = ["codex", "antigravity", "opencode"] as const;
    expect(nextBackup(order, "codex", ready)).toBe("antigravity");
    expect(nextBackup(order, "antigravity", ready)).toBe("opencode");
    expect(nextBackup(order, "opencode", ready)).toBe("codex");
    // An AI outside the order starts at the top of it.
    expect(nextBackup(order, "claude", ready)).toBe("codex");
  });

  it("skips AIs that are not ready or already tried, and gives up when none is left", () => {
    const order = ["codex", "antigravity", "opencode"] as const;
    expect(nextBackup(order, "codex", (provider) => provider !== "antigravity")).toBe("opencode");
    expect(nextBackup(order, "codex", ready, new Set(["antigravity", "opencode"]))).toBeNull();
    expect(nextBackup(order, "codex", () => false)).toBeNull();
    expect(nextBackup([], "codex", ready)).toBeNull();
    expect(nextBackup(["codex"], "codex", ready)).toBeNull();
  });

  it("skips an AI at its limit until the limit is back", () => {
    let now = 1_000_000;
    const watch = new LimitWatch(() => now);
    expect(watch.limited("codex")).toBe(false);
    watch.mark("codex");
    expect(watch.limited("codex")).toBe(true);
    expect(watch.until("codex")).toBe(1_000_000 + DEFAULT_LIMIT_COOLDOWN_MS);
    now += DEFAULT_LIMIT_COOLDOWN_MS + 1;
    expect(watch.limited("codex")).toBe(false);
    watch.mark("claude", now + 5_000);
    expect(watch.until("claude")).toBe(now + 5_000);
    watch.clear("claude");
    expect(watch.limited("claude")).toBe(false);
  });

  it("reads when the limit comes back from the AI's own words", () => {
    const now = 10_000_000;
    expect(
      limitResetFromText("quota for your account is used up; it resets in 9h54m20s.", now),
    ).toBe(now + (9 * 3600 + 54 * 60 + 20) * 1_000);
    expect(limitResetFromText("You've hit your usage limit. Try again in 35 minutes.", now)).toBe(
      now + 35 * 60_000,
    );
    // ChatGPT gives a clock time: today when it is still ahead, else tomorrow.
    const noon = new Date(2026, 10, 18, 12, 0, 0).getTime();
    const chatgpt = "You’ve hit your usage limit. Upgrade to Pro, or try again at 8:22 PM.";
    expect(limitResetFromText(chatgpt, noon)).toBe(new Date(2026, 10, 18, 20, 22, 0).getTime());
    const lateNight = new Date(2026, 10, 18, 23, 0, 0).getTime();
    expect(limitResetFromText(chatgpt, lateNight)).toBe(
      new Date(2026, 10, 19, 20, 22, 0).getTime(),
    );
    // A used-up plan with no time: an hour. A brief "too many requests": ten minutes.
    expect(limitResetFromText("You've hit your usage limit.", now)).toBe(
      now + DEFAULT_LIMIT_COOLDOWN_MS,
    );
    expect(limitResetFromText("HTTP 429 Too Many Requests", now)).toBe(now + 10 * 60_000);
  });
});

describe("what is kept on disk for a move", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sk-ai-switch-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keeps the note and the earlier chat across a restart", async () => {
    const store = new AiSwitchStore(root);
    await store.load();
    const reply = message("assistant", "The list is ready.");
    const ownerMessage = message("user", "Make the list", {
      delivery: { id: "d1", status: "completed", position: null },
    });
    await store.remember("chief", "thread-1", [ownerMessage, reply]);
    await store.setPending("chief", {
      note: "NOTE",
      from: "codex",
      to: "claude",
      at: new Date().toISOString(),
    });

    const again = new AiSwitchStore(root);
    await again.load();
    expect(again.pending("chief")?.note).toBe("NOTE");
    // The owner's own message stays with the mailbox; the reply is kept under the old chat's id.
    expect(again.earlier("chief").map((item) => item.message.id)).toEqual([`thread-1:${reply.id}`]);
    expect(again.earlier("chief")[0].threadId).toBe("thread-1");
  });

  it("does not keep a message twice over several moves", async () => {
    const store = new AiSwitchStore(root);
    const first = message("assistant", "First AI's reply");
    await store.remember("chief", "thread-1", [first]);
    // On the second AI the screen shows the kept copy plus the new reply.
    const onScreen = [
      { ...store.earlier("chief")[0].message },
      message("assistant", "Second AI's reply"),
    ];
    await store.remember("chief", "thread-2", onScreen);
    expect(store.earlier("chief").map((item) => item.threadId)).toEqual(["thread-1", "thread-2"]);
    await store.dropThread("chief", "thread-1");
    expect(store.earlier("chief").map((item) => item.threadId)).toEqual(["thread-2"]);
  });

  it("cuts very long tool output and marks unfinished messages as stopped", async () => {
    const store = new AiSwitchStore(root);
    await store.remember("chief", "thread-1", [
      message("assistant", "", {
        itemType: "toolCall",
        status: "streaming",
        tool: {
          name: "shell",
          kind: "command",
          status: "running",
          input: "x".repeat(50_000),
          output: "y".repeat(50_000),
        },
      }),
    ]);
    const kept = store.earlier("chief")[0].message;
    expect(kept.status).toBe("interrupted");
    expect(kept.tool?.status).toBe("failed");
    expect(kept.tool?.output?.length).toBeLessThan(2_100);
  });

  it("remembers who covers for a coworker, and forgets everything with the coworker", async () => {
    const store = new AiSwitchStore(root);
    await store.setCover("chief", {
      model: "gpt-5.5",
      reasoningEffort: "medium",
      threadId: "thread-1",
      coveringModel: "opencode-free",
      since: new Date().toISOString(),
      stayUntil: Date.now() + 60_000,
    });
    const again = new AiSwitchStore(root);
    await again.load();
    expect(again.covers().chief?.coveringModel).toBe("opencode-free");
    await again.forget("chief");
    expect(again.covers().chief).toBeUndefined();
    expect(again.pending("chief")).toBeNull();
    expect(again.earlier("chief")).toEqual([]);
  });
});
