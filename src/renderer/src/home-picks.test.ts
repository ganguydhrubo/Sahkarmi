import { beforeEach, describe, expect, it } from "vitest";
import { notePick, preferredPick } from "./home-picks";

describe("home picks", () => {
  beforeEach(() => window.localStorage.clear());

  it("suggests a coworker only after the owner chose them twice", () => {
    expect(preferredPick("accounts")).toBeNull();
    notePick("accounts", "riya");
    expect(preferredPick("accounts")).toBeNull();
    notePick("accounts", "riya");
    expect(preferredPick("accounts")).toBe("riya");
    expect(preferredPick("sales")).toBeNull();
  });

  it("follows the coworker chosen most often", () => {
    notePick("sales", "a");
    notePick("sales", "a");
    notePick("sales", "b");
    notePick("sales", "b");
    notePick("sales", "b");
    expect(preferredPick("sales")).toBe("b");
  });

  it("survives broken stored data", () => {
    window.localStorage.setItem("sahkarmi:home-picks", "not json");
    expect(preferredPick("ops")).toBeNull();
    notePick("ops", "x");
    notePick("ops", "x");
    expect(preferredPick("ops")).toBe("x");
  });
});
