import { describe, expect, it } from "vitest";
import { posixProcessRows } from "./app-memory";
import { availableBytesFromVmStat } from "./mac-memory";

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                3271.
Pages active:                            214530.
Pages inactive:                          198211.
Pages speculative:                         1920.
Pages throttled:                              0.
Pages wired down:                         96511.
Pages purgeable:                           5112.
"Translation faults":                 392311004.
Pages copy-on-write:                   10911563.
`;

describe("Mac memory reading", () => {
  it("counts free, inactive, speculative and purgeable pages as usable", () => {
    expect(availableBytesFromVmStat(VM_STAT)).toBe((3271 + 198211 + 1920 + 5112) * 16384);
  });

  it("is null for text it cannot read", () => {
    expect(availableBytesFromVmStat("")).toBeNull();
    expect(availableBytesFromVmStat("Pages free: 10.")).toBeNull();
  });

  it("reads the process list of ps, with spaces in a program name", () => {
    const rows = posixProcessRows(
      [
        "    1     0   12345 /sbin/launchd",
        "  812     1  204800 /Applications/Sahkarmi.app/Contents/MacOS/Sahkarmi",
        "  815   812   51200 /Applications/Sahkarmi.app/Contents/Frameworks/Sahkarmi Helper (Renderer).app/Contents/MacOS/Sahkarmi Helper (Renderer)",
        "garbage line",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { pid: 1, ppid: 0, name: "launchd", bytes: 12345 * 1024 },
      { pid: 812, ppid: 1, name: "Sahkarmi", bytes: 204800 * 1024 },
      { pid: 815, ppid: 812, name: "Sahkarmi Helper (Renderer)", bytes: 51200 * 1024 },
    ]);
  });
});
