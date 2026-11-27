import { describe, expect, it } from "vitest";
import {
  addTeachStep,
  MAX_TEACH_STEPS,
  parseTeachStep,
  plainAddress,
  safeTypedValue,
  type TeachStep,
  teachSkillMarkdown,
  teachStepLine,
  teachStepLines,
} from "./teach";

describe("teach a task", () => {
  it("keeps a page address without its private tail, and only web pages", () => {
    expect(plainAddress("https://shop.example/orders/list?id=991&token=abc#top")).toBe(
      "https://shop.example/orders/list",
    );
    expect(plainAddress("file:///C:/secret.txt")).toBe("");
    expect(plainAddress("not a url")).toBe("");
  });

  it("never keeps long numbers or things that look like a key", () => {
    expect(safeTypedValue("Sharma Traders")).toBe("Sharma Traders");
    expect(safeTypedValue("4111 1111 1111 1111")).toBeNull();
    expect(safeTypedValue("98765-43210")).toBeNull();
    expect(safeTypedValue("abc123def456ghi789jkl012mno345pq")).toBeNull();
    expect(safeTypedValue("Invoice 42")).toBe("Invoice 42");
    expect(safeTypedValue("   ")).toBe("");
  });

  it("accepts only well-formed steps from the page", () => {
    expect(parseTeachStep({ kind: "click", name: " Download  bill ", role: "button" })).toEqual({
      kind: "click",
      name: "Download bill",
      role: "button",
    });
    expect(parseTeachStep({ kind: "click", name: "" })).toBeNull();
    expect(parseTeachStep({ kind: "type", field: "Password", value: null })).toEqual({
      kind: "type",
      field: "Password",
      value: null,
    });
    // A long number typed into an ordinary field is dropped too.
    expect(parseTeachStep({ kind: "type", field: "Phone", value: "9876543210" })).toEqual({
      kind: "type",
      field: "Phone",
      value: null,
    });
    expect(parseTeachStep({ kind: "key", key: "Escape" })).toBeNull();
    expect(parseTeachStep({ kind: "open", url: "https://evil.example" })).toBeNull();
    expect(parseTeachStep("click")).toBeNull();
  });

  it("drops exact repeats, keeps the last words typed in a field, and stops at the limit", () => {
    const steps: TeachStep[] = [];
    expect(addTeachStep(steps, { kind: "click", name: "Search", role: "button" })).toBe(true);
    expect(addTeachStep(steps, { kind: "click", name: "Search", role: "button" })).toBe(false);
    addTeachStep(steps, { kind: "type", field: "Name", value: "Sha" });
    addTeachStep(steps, { kind: "type", field: "Name", value: "Sharma" });
    expect(steps).toEqual([
      { kind: "click", name: "Search", role: "button" },
      { kind: "type", field: "Name", value: "Sharma" },
    ]);
    const full: TeachStep[] = Array.from({ length: MAX_TEACH_STEPS }, (_, index) => ({
      kind: "click",
      name: `Button ${index}`,
      role: "button",
    }));
    expect(addTeachStep(full, { kind: "key", key: "Enter" })).toBe(false);
    expect(full).toHaveLength(MAX_TEACH_STEPS);
  });

  it("reads each step in plain words and never shows a private value", () => {
    expect(teachStepLine({ kind: "open", url: "https://gst.example/login" })).toBe(
      "Open https://gst.example/login",
    );
    expect(teachStepLine({ kind: "click", name: "File return", role: "link" })).toBe(
      'Click "File return" (link)',
    );
    expect(teachStepLine({ kind: "choose", field: "Month", value: "November" })).toBe(
      'Choose "November" in "Month"',
    );
    const secret = teachStepLine({ kind: "type", field: "Password", value: null });
    expect(secret).toContain("secure input");
    expect(teachStepLine({ kind: "type", field: "Party", value: "Sharma" })).toContain('"Sharma"');
    expect(teachStepLine({ kind: "key", key: "Enter" })).toBe("Press Enter");
  });

  it("makes a skill file that the app's own skill reader accepts", () => {
    const text = teachSkillMarkdown({
      name: "Download the GST: bill",
      whenToUse: "",
      lines: teachStepLines([
        { kind: "open", url: "https://gst.example/login" },
        { kind: "click", name: "Download", role: "button" },
      ]),
    });
    expect(text.startsWith("---\nname: Download the GST  bill\ndescription: Steps the owner")).toBe(
      true,
    );
    expect(text).toContain("# Download the GST  bill");
    expect(text).toContain("1. Open https://gst.example/login");
    expect(text).toContain('2. Click "Download" (button)');
    expect(text).toContain("stop and ask the owner");
  });
});
