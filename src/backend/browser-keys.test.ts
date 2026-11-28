import { describe, expect, it } from "vitest";
import { type CdpSend, cdpKeyEvent, pressCdpKey, typeIntoFocus } from "./browser-keys";

function recorder(): { send: CdpSend; calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    send: async (method, params) => {
      calls.push([method, params]);
      return {};
    },
  };
}

/** What a page sees: the keys pressed and the text inserted, in order. */
function typed(calls: Array<[string, Record<string, unknown>]>): string[] {
  return calls.flatMap(([method, params]) => {
    if (method === "Input.insertText") return [`insert:${String(params.text)}`];
    if (params.type === "keyUp") return [];
    return [`key:${String(params.key)}${params.modifiers ? `+${String(params.modifiers)}` : ""}`];
  });
}

describe("typeIntoFocus", () => {
  it("fills spreadsheet cells: Tab between cells, Enter between rows", async () => {
    const { send, calls } = recorder();
    await typeIntoFocus(send, "17-Oct\tFri\n19-Oct\tSun");
    expect(typed(calls)).toEqual([
      "key:1",
      "insert:7-Oct",
      "key:Tab",
      "key:F",
      "insert:ri",
      "key:Enter",
      "key:1",
      "insert:9-Oct",
      "key:Tab",
      "key:S",
      "insert:un",
    ]);
  });

  it("starts every cell with a real key press that carries its text", async () => {
    const { send, calls } = recorder();
    await typeIntoFocus(send, "x");
    expect(calls).toEqual([
      [
        "Input.dispatchKeyEvent",
        expect.objectContaining({
          type: "keyDown",
          key: "x",
          text: "x",
          windowsVirtualKeyCode: 88,
        }),
      ],
      ["Input.dispatchKeyEvent", expect.objectContaining({ type: "keyUp", key: "x" })],
    ]);
  });

  it("keeps Hindi text and Windows line endings, and skips empty cells", async () => {
    const { send, calls } = recorder();
    await typeIntoFocus(send, "नमस्ते\r\n\tok");
    expect(typed(calls)).toEqual([
      "key:न",
      "insert:मस्ते",
      "key:Enter",
      "key:Tab",
      "key:o",
      "insert:k",
    ]);
  });
});

describe("pressCdpKey", () => {
  it("sends key combos like Ctrl+V with the modifier set", async () => {
    const { send, calls } = recorder();
    await pressCdpKey(send, "Control+v", "win32");
    expect(calls[0]).toEqual([
      "Input.dispatchKeyEvent",
      expect.objectContaining({ type: "rawKeyDown", code: "KeyV", modifiers: 2 }),
    ]);
    expect(calls[0]?.[1]).not.toHaveProperty("text");
    expect(calls[1]?.[1]).toMatchObject({ type: "keyUp", code: "KeyV", modifiers: 2 });
  });

  it("on a Mac sends Ctrl+V as Command+V with the paste command", async () => {
    const { send, calls } = recorder();
    await pressCdpKey(send, "Ctrl+V", "darwin");
    expect(calls[0]?.[1]).toMatchObject({
      type: "rawKeyDown",
      code: "KeyV",
      modifiers: 4,
      commands: ["paste"],
    });
    expect(calls[1]?.[1]).toMatchObject({ type: "keyUp", code: "KeyV", modifiers: 4 });
    expect(calls[1]?.[1]).not.toHaveProperty("commands");
  });

  it("on a Mac keeps other Ctrl combos and maps CommandOrControl to Command", () => {
    expect(cdpKeyEvent("Ctrl+a", "darwin")).toMatchObject({
      modifiers: 4,
      commands: ["selectAll"],
    });
    expect(cdpKeyEvent("Ctrl+Shift+z", "darwin")).toMatchObject({
      modifiers: 12,
      commands: ["redo"],
    });
    expect(cdpKeyEvent("Ctrl+k", "darwin")).toMatchObject({ modifiers: 2 });
    expect(cdpKeyEvent("Ctrl+k", "darwin")).not.toHaveProperty("commands");
    expect(cdpKeyEvent("CommandOrControl+k", "darwin")).toMatchObject({ modifiers: 4 });
    expect(cdpKeyEvent("CommandOrControl+k", "win32")).toMatchObject({ modifiers: 2 });
    expect(cdpKeyEvent("Ctrl+a", "win32")).not.toHaveProperty("commands");
  });

  it("presses Shift+Tab", async () => {
    const { send, calls } = recorder();
    await pressCdpKey(send, "Shift+Tab");
    expect(calls[0]?.[1]).toMatchObject({ key: "Tab", modifiers: 8 });
  });
});
