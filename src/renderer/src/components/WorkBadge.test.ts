import { describe, expect, it } from "vitest";
import { workKind } from "./WorkBadge";

describe("workKind", () => {
  it("names the work from the tool being used", () => {
    expect(workKind("executing_tool", "browser")).toBe("browsing");
    expect(workKind("executing_tool", "files_read")).toBe("reading");
    expect(workKind("executing_tool", "files_write")).toBe("writing");
    expect(workKind("executing_tool", "code")).toBe("coding");
    expect(workKind("executing_tool", "coworker")).toBe("handing");
  });

  it("shows thinking while the model works, waiting while it waits", () => {
    expect(workKind("thinking", null)).toBe("thinking");
    expect(workKind("waiting_approval", null)).toBe("waiting");
    expect(workKind("researching", null)).toBe("browsing");
  });

  it("shows nothing when idle or finished", () => {
    expect(workKind("idle", null)).toBeNull();
    expect(workKind("completed", null)).toBeNull();
    expect(workKind("failed", null)).toBeNull();
  });
});
