import { describe, expect, it } from "vitest";
import {
  DesktopMacHost,
  type ExecImpl,
  MacPermissionError,
  macChords,
  splitArguments,
} from "./desktop-mac-host";
import { DESKTOP_MAC_SCRIPT } from "./desktop-mac-script";
import {
  desktopPromptLines,
  opensCommandPrompt,
  parseKeys,
  validateLaunchTarget,
} from "./desktop-tools";

function host(answers: (file: string, args: string[]) => string, calls: string[][] = []) {
  const execImpl: ExecImpl = async (file, args) => {
    calls.push([file, ...args]);
    return { stdout: answers(file, args), stderr: "" };
  };
  return new DesktopMacHost({
    scriptDir: `${process.env.TEMP ?? "/tmp"}/sk-mac-host-test`,
    protectedPids: [42],
    execImpl,
  });
}

describe("Mac keys", () => {
  it("maps shortcuts to Mac key codes and modifier flags", () => {
    expect(macChords(parseKeys("cmd+s").chords)).toEqual([{ code: 1, flags: 0x100000 }]);
    expect(macChords(parseKeys("ctrl+shift+a").chords)).toEqual([
      { code: 0, flags: 0x40000 | 0x20000 },
    ]);
    expect(macChords(parseKeys("alt+tab enter f5 delete").chords)).toEqual([
      { code: 48, flags: 0x80000 },
      { code: 36, flags: 0 },
      { code: 96, flags: 0 },
      { code: 117, flags: 0 },
    ]);
    expect(macChords(parseKeys("shift").chords)).toEqual([{ code: -1, flags: 0x20000 }]);
  });

  it("refuses keys a Mac does not have", () => {
    expect(() => macChords(parseKeys("printscreen").chords)).toThrow(/Print Screen/);
    expect(() => macChords(parseKeys("f22").chords)).toThrow(/no such key/);
  });

  it("treats cmd+space (Spotlight) as a way to a command line on a Mac only", () => {
    expect(opensCommandPrompt(parseKeys("cmd+space").chords, "darwin")).toBe("Spotlight");
    expect(opensCommandPrompt(parseKeys("cmd+r").chords, "darwin")).toBeNull();
    expect(opensCommandPrompt(parseKeys("win+r").chords, "win32")).toBe("the Run box");
  });
});

describe("Mac launching", () => {
  it("blocks Terminal, shells, scripts and downloaded apps", () => {
    for (const target of [
      "Terminal",
      "/System/Applications/Utilities/Terminal.app",
      "iTerm",
      "osascript",
      "zsh",
      "Script Editor",
      "/Users/me/run.command",
      "/Users/me/setup.sh",
      "/Users/me/Downloads/Thing.app",
      "/Users/me/x.pkg",
    ]) {
      expect(() => validateLaunchTarget(target, undefined), target).toThrow();
    }
    expect(() => validateLaunchTarget("TextEdit", undefined)).not.toThrow();
    expect(() => validateLaunchTarget("Microsoft Excel", undefined)).not.toThrow();
  });

  it("splits arguments with quotes", () => {
    expect(splitArguments(`--new "My File.txt" 'b c' d`)).toEqual([
      "--new",
      "My File.txt",
      "b c",
      "d",
    ]);
  });

  it("opens a bare name as an app and reports the new window", async () => {
    const calls: string[][] = [];
    let lists = 0;
    const mac = host((file) => {
      if (file === "/usr/bin/open") return "";
      lists += 1;
      const windows =
        lists === 1
          ? []
          : [{ handle: "0x10", title: "Untitled", process: "TextEdit", pid: 7, minimized: false }];
      return JSON.stringify({ ok: true, windows });
    }, calls);
    const reply = await mac.request({ op: "launch", target: "TextEdit", arguments: "-n" });
    expect(calls.find((call) => call[0] === "/usr/bin/open")).toEqual([
      "/usr/bin/open",
      "-a",
      "TextEdit",
      "--args",
      "-n",
    ]);
    expect(reply.pid).toBe(7);
    expect(reply.newWindows).toHaveLength(1);
  });
});

describe("Mac host replies", () => {
  it("passes the protected pids and the Mac key codes to the script", async () => {
    const calls: string[][] = [];
    const mac = host(() => JSON.stringify({ ok: true, pressed: 1 }), calls);
    await mac.request({ op: "key", chords: parseKeys("cmd+v").chords, repeat: 1 });
    const [file, ...args] = calls[0] ?? [];
    expect(file).toBe("/usr/bin/osascript");
    expect(args.slice(0, 2)).toEqual(["-l", "JavaScript"]);
    const sent = JSON.parse(args[3] ?? "{}");
    expect(sent.protectedPids).toEqual([42]);
    expect(sent.macChords).toEqual([{ code: 9, flags: 0x100000 }]);
  });

  it("turns a missing macOS permission into a MacPermissionError", async () => {
    const seen: string[] = [];
    const mac = new DesktopMacHost({
      scriptDir: `${process.env.TEMP ?? "/tmp"}/sk-mac-host-test`,
      protectedPids: [],
      onPermissionMissing: (permission) => seen.push(permission),
      execImpl: async () => ({
        stdout: JSON.stringify({ ok: false, error: "Allow it", permission: "accessibility" }),
        stderr: "",
      }),
    });
    await expect(mac.request({ op: "click", x: 1, y: 1 })).rejects.toBeInstanceOf(
      MacPermissionError,
    );
    expect(seen).toEqual(["accessibility"]);
  });

  it("passes on a plain failure as an Error", async () => {
    const mac = host(() => JSON.stringify({ ok: false, error: "No open window matches" }));
    await expect(mac.request({ op: "focus_window", title: "x" })).rejects.toThrow(
      "No open window matches",
    );
  });
});

describe("Mac prompt and script", () => {
  it("tells Mac coworkers to use cmd shortcuts and never mentions Windows", () => {
    const lines = desktopPromptLines("ask", "darwin").join("\n");
    expect(lines).toContain("cmd+s");
    expect(lines).not.toMatch(/Windows/);
    expect(desktopPromptLines("deny", "darwin")[0]).toContain("Control this Mac");
  });

  it("keeps the script free of template holes and answers every tool's request", () => {
    expect(DESKTOP_MAC_SCRIPT).not.toContain("${");
    for (const op of [
      "list_windows",
      "focus_window",
      "geometry",
      "move",
      "click",
      "scroll",
      "drag",
      "type",
      "key",
      "close_window",
      "read_ui",
      "find_element",
      "permissions",
    ]) {
      expect(DESKTOP_MAC_SCRIPT).toContain(`case '${op}'`);
    }
  });
});
