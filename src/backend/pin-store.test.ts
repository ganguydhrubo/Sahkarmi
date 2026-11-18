import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PINS_PER_CHAT, PIN_TEXT_CHARS, PinStore } from "./pin-store";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function store(): Promise<{ pins: PinStore; dir: string; tick: () => void }> {
  const dir = await mkdtemp(join(tmpdir(), "sk-pins-"));
  dirs.push(dir);
  let clock = Date.parse("2026-11-18T10:00:00Z");
  const pins = new PinStore(dir, () => new Date(clock));
  await pins.initialize();
  return { pins, dir, tick: () => (clock += 1_000) };
}

describe("PinStore", () => {
  it("pins, lists newest first, unpins and keeps the pins after a restart", async () => {
    const { pins, dir, tick } = await store();
    await pins.toggle({ botId: "a", messageId: "m1", text: "  Price list: Rs 450 a bag  " });
    tick();
    const after = await pins.toggle({
      botId: "a",
      messageId: "m2",
      text: "Address: 12 Park Street",
    });
    expect(after.map((pin) => pin.messageId)).toEqual(["m2", "m1"]);
    expect(after[1]?.text).toBe("Price list: Rs 450 a bag");
    expect(pins.list("b")).toEqual([]);

    const reopened = new PinStore(dir);
    await reopened.initialize();
    expect(reopened.list("a")).toHaveLength(2);

    expect(await pins.toggle({ botId: "a", messageId: "m2", text: "" })).toHaveLength(1);
  });

  it("keeps the newest pins only, trims long text and refuses empty text", async () => {
    const { pins, tick } = await store();
    for (let i = 0; i < MAX_PINS_PER_CHAT + 2; i++) {
      await pins.toggle({ botId: "a", messageId: `m${i}`, text: `note ${i}` });
      tick();
    }
    const list = pins.list("a");
    expect(list).toHaveLength(MAX_PINS_PER_CHAT);
    expect(list.some((pin) => pin.messageId === "m0")).toBe(false);

    const long = await pins.toggle({
      botId: "b",
      messageId: "x",
      text: "y".repeat(PIN_TEXT_CHARS + 50),
    });
    expect(long[0]?.text).toHaveLength(PIN_TEXT_CHARS);
    await expect(pins.toggle({ botId: "b", messageId: "z", text: "   " })).rejects.toThrow(
      /no text/,
    );
  });

  it("drops a deleted coworker's pins", async () => {
    const { pins, dir } = await store();
    await pins.toggle({ botId: "a", messageId: "m1", text: "keep" });
    await pins.toggle({ botId: "gone", messageId: "m1", text: "remove" });
    await pins.deleteBotData("gone");
    expect(pins.list("gone")).toEqual([]);
    expect(await readFile(join(dir, "pins.json"), "utf8")).not.toContain("remove");
  });
});
