import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConversationMessage } from "../shared/ipc";
import {
  RepeatJobStore,
  repeatJobOf,
  repeatNote,
  repeatSaving,
  routeOf,
  withRepeatNote,
} from "./repeat-jobs";

function toolStep(
  turnId: string,
  name: string,
  input: string,
  status: "completed" | "failed" = "completed",
): ConversationMessage {
  return {
    id: `${turnId}-${name}-${input}`,
    turnId,
    author: "assistant",
    text: "",
    createdAt: new Date().toISOString(),
    status: "completed",
    itemType: "toolCall",
    tool: { name, kind: "browser", status, input, output: "BIG PAGE TEXT ".repeat(200) },
  };
}

describe("spotting a repeated job", () => {
  it("knows a scheduled task by its text, whatever the day", () => {
    const monday = repeatJobOf({
      origin: "schedule",
      text: "[Scheduled task] Write and post today's  Instagram post for the shop",
      recipientBotId: "maya",
    });
    const tuesday = repeatJobOf({
      origin: "schedule",
      text: "[Scheduled task] write and post today's Instagram post for the shop",
      recipientBotId: "maya",
    });
    expect(monday?.key).toBe(tuesday?.key);
    expect(monday).toMatchObject({ step: 1, totalSteps: 1 });
    expect(monday?.title).toBe("Write and post today's  Instagram post for the shop");
    // Another coworker, or another task, is another job.
    expect(
      repeatJobOf({
        origin: "schedule",
        text: "[Scheduled task] Write and post today's Instagram post for the shop",
        recipientBotId: "asha",
      })?.key,
    ).not.toBe(monday?.key);
  });

  it("knows a routine by its name and step", () => {
    expect(
      repeatJobOf({
        origin: "routine",
        text: '[Routine "Daily post" · step 2/3] Post it on Facebook',
        recipientBotId: "maya",
      }),
    ).toEqual({ key: "routine:maya:Daily post", title: "Daily post", step: 2, totalSteps: 3 });
    expect(
      repeatJobOf({
        origin: "routine",
        text: '[Routine "Daily post" · step 3/3 · yes/no check] Is it live?',
        recipientBotId: "maya",
      })?.step,
    ).toBe(3);
  });

  it("leaves ordinary messages alone", () => {
    expect(
      repeatJobOf({ origin: "owner", text: "Write today's post", recipientBotId: "maya" }),
    ).toBeNull();
    expect(repeatJobOf({ text: "[Scheduled task] x", recipientBotId: "maya" })).toBeNull();
    expect(
      repeatJobOf({ origin: "team-run", text: "[Routine] x", recipientBotId: "maya" }),
    ).toBeNull();
  });
});

describe("what a repeated job remembers", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sk-repeat-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("keeps the route as short lines, never a tool's output", () => {
    const route = routeOf(
      [
        toolStep("t1", "Browser Open", "https://business.facebook.com/latest/composer"),
        toolStep("t1", "Browser Act", "scroll down"),
        toolStep("t1", "Browser Act", "scroll down"),
        toolStep("t1", "Browser Act", "click Publish", "failed"),
        toolStep("t1", "Browser Act", "click Publish"),
        toolStep("t2", "Browser Open", "https://other.example"),
      ],
      "t1",
    );
    expect(route).toEqual([
      "Browser Open: https://business.facebook.com/latest/composer",
      "Browser Act: scroll down",
      "Browser Act: click Publish",
    ]);
  });

  it("builds a short note from the last good run, and none before the first", async () => {
    const store = new RepeatJobStore(root);
    const ref = { key: "schedule:maya:abc", title: "Daily post", step: 1, totalSteps: 1 };
    expect(store.get(ref.key)).toBeNull();
    const first = await store.record(ref, {
      ok: true,
      lean: false,
      tokens: 180_000,
      route: ["Browser Open: https://business.facebook.com", "Browser Act: click Publish"],
      files: ["post-monday.png"],
      result: "Posted: Monday offer on cotton sarees.",
    });
    expect(first.runs).toBe(1);

    const note = repeatNote({ job: first, ref, cleanChat: true });
    expect(note).toContain("You have done this same job once before.");
    expect(note).toContain("This is a clean chat so that the old runs are not read again");
    expect(note).toContain("- Browser Open: https://business.facebook.com");
    expect(note).toContain("Files made last time: post-monday.png");
    expect(note).toContain("- Posted: Monday offer on cotton sarees.");
    expect(note).toContain("skip list_skills and save_skill");
    // A few hundred words, not days of history.
    expect((note ?? "").length).toBeLessThan(1_500);
    expect(withRepeatNote(note ?? "", "[Scheduled task] Post")).toMatch(
      /--- the job to do now ---\n\[Scheduled task\] Post$/,
    );

    // Nothing learned yet: no note.
    expect(
      repeatNote({
        job: { ...first, runs: 0 },
        ref,
        cleanChat: true,
      }),
    ).toBeNull();
  });

  it("keeps the latest five results, and the fuller route when a run shows none", async () => {
    const store = new RepeatJobStore(root);
    const ref = { key: "schedule:maya:abc", title: "Daily post", step: 1, totalSteps: 1 };
    await store.record(ref, {
      ok: true,
      lean: false,
      tokens: null,
      route: ["Browser Open: https://x.example"],
      files: [],
      result: "Post 1",
    });
    let job = store.get(ref.key);
    for (let day = 2; day <= 7; day += 1) {
      job = await store.record(ref, {
        ok: true,
        lean: true,
        tokens: null,
        route: [],
        files: [],
        result: `Post ${day}`,
      });
    }
    expect(job?.runs).toBe(7);
    expect(job?.steps["1"].recent).toEqual(["Post 3", "Post 4", "Post 5", "Post 6", "Post 7"]);
    expect(job?.steps["1"].route).toEqual(["Browser Open: https://x.example"]);

    // A failed run is in the history but teaches nothing and is not counted.
    job = await store.record(ref, {
      ok: false,
      lean: true,
      tokens: null,
      route: ["Browser Open: https://broken.example"],
      files: [],
      result: "",
    });
    expect(job.runs).toBe(7);
    expect(job.steps["1"].route).toEqual(["Browser Open: https://x.example"]);

    const again = new RepeatJobStore(root);
    await again.load();
    expect(again.get(ref.key)?.runs).toBe(7);
    await again.forgetBot("maya");
    expect(again.get(ref.key)).toBeNull();
  });

  it("counts a routine's run once, at its last step", async () => {
    const store = new RepeatJobStore(root);
    const run = { ok: true, lean: false, tokens: null, route: [], files: [], result: "ok" };
    const first = await store.record(
      { key: "routine:maya:Daily", title: "Daily", step: 1, totalSteps: 2 },
      run,
    );
    expect(first.runs).toBe(0);
    const second = await store.record(
      { key: "routine:maya:Daily", title: "Daily", step: 2, totalSteps: 2 },
      run,
    );
    expect(second.runs).toBe(1);
    expect(Object.keys(second.steps)).toEqual(["1", "2"]);
  });

  it("reports the saving only from measured runs", async () => {
    const store = new RepeatJobStore(root);
    const ref = { key: "schedule:maya:abc", title: "Daily post", step: 1, totalSteps: 1 };
    const base = { ok: true, route: [], files: [], result: "x" };
    let job = await store.record(ref, { ...base, lean: false, tokens: 200_000 });
    expect(repeatSaving(job)).toBeNull();
    job = await store.record(ref, { ...base, lean: true, tokens: null });
    expect(repeatSaving(job)).toBeNull();
    job = await store.record(ref, { ...base, lean: true, tokens: 30_000 });
    expect(repeatSaving(job)).toEqual({ first: 200_000, latest: 30_000, percent: 15 });
  });
});
