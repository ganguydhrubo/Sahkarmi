import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DesktopHostLike } from "./desktop-host";
import { DESKTOP_MAC_SCRIPT } from "./desktop-mac-script";
import type { KeyStroke } from "./desktop-tools";

/** The macOS permission a desktop step was refused for. */
export type MacDesktopPermission = "accessibility" | "screen" | "automation";

export class MacPermissionError extends Error {
  constructor(
    message: string,
    readonly permission: MacDesktopPermission,
  ) {
    super(message);
  }
}

export interface DesktopMacHostOptions {
  /** Folder the helper script is written to (userData/desktop). */
  scriptDir: string;
  /** Sahkarmi's own process ids: their windows are never clicked, typed into or focused. */
  protectedPids: number[];
  /** Called when macOS refused a permission (main opens the right Settings pane). */
  onPermissionMissing?: (permission: MacDesktopPermission) => void;
  /** Replaced in tests. */
  execImpl?: ExecImpl;
}

export type ExecImpl = (
  file: string,
  args: string[],
  timeoutMs: number,
) => Promise<{ stdout: string; stderr: string }>;

const DEFAULT_TIMEOUT_MS = 30_000;
const FLAG = { command: 0x100000, shift: 0x20000, option: 0x80000, control: 0x40000 } as const;

/** Windows virtual-key codes (what parseKeys gives) to Mac key codes. */
const MAC_KEY_CODES: Record<number, number> = {
  13: 36, // return
  9: 48, // tab
  27: 53, // escape
  32: 49, // space
  8: 51, // backspace ("delete" on a Mac keyboard)
  46: 117, // forward delete
  45: 114, // insert = help
  36: 115, // home
  35: 119, // end
  33: 116, // page up
  34: 121, // page down
  37: 123, // left
  39: 124, // right
  40: 125, // down
  38: 126, // up
  20: 57, // caps lock
  187: 24, // =
  189: 27, // -
  186: 41, // ;
  188: 43, // ,
  190: 47, // .
  191: 44, // /
  192: 50, // `
  219: 33, // [
  220: 42, // \
  221: 30, // ]
  222: 39, // '
};
const LETTER_CODES: Record<string, number> = {
  A: 0,
  S: 1,
  D: 2,
  F: 3,
  H: 4,
  G: 5,
  Z: 6,
  X: 7,
  C: 8,
  V: 9,
  B: 11,
  Q: 12,
  W: 13,
  E: 14,
  R: 15,
  Y: 16,
  T: 17,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "6": 22,
  "5": 23,
  "9": 25,
  "7": 26,
  "8": 28,
  "0": 29,
  O: 31,
  U: 32,
  I: 34,
  P: 35,
  L: 37,
  J: 38,
  K: 40,
  N: 45,
  M: 46,
};
/** F1 to F20 (Macs have no F21 to F24). */
const FUNCTION_CODES = [
  122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79, 80, 90,
];

export interface MacChord {
  /** The main key, or -1 for modifiers alone. */
  code: number;
  flags: number;
}

/** Turns parsed chords into Mac key codes and modifier flags; throws on a key a Mac lacks. */
export function macChords(chords: KeyStroke[][]): MacChord[] {
  return chords.map((chord) => {
    let flags = 0;
    let code = -1;
    for (const stroke of chord) {
      const vk = stroke.vk;
      if (vk === 0x11) flags |= FLAG.control;
      else if (vk === 0x12) flags |= FLAG.option;
      else if (vk === 0x10) flags |= FLAG.shift;
      else if (vk === 0x5b || vk === 0x5c) flags |= FLAG.command;
      else code = macKeyCode(vk);
    }
    return { code, flags };
  });
}

function macKeyCode(vk: number): number {
  const named = MAC_KEY_CODES[vk];
  if (named !== undefined) return named;
  const char = String.fromCharCode(vk);
  const letter = LETTER_CODES[char];
  if (letter !== undefined) return letter;
  if (vk >= 0x70 && vk <= 0x83) return FUNCTION_CODES[vk - 0x70] as number;
  if (vk === 0x2c) {
    throw new Error("A Mac has no Print Screen key. Use desktop_screenshot to see the screen.");
  }
  throw new Error(
    "A Mac keyboard has no such key. Use cmd, ctrl, option (alt) or shift with a letter, or a named key like enter.",
  );
}

/** Splits an arguments line like a shell would (quotes kept together), without running one. */
export function splitArguments(line: string): string[] {
  const out: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of line.matchAll(pattern)) out.push(match[1] ?? match[2] ?? match[3] ?? "");
  return out;
}

const defaultExec: ExecImpl = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message)
            .trim()
            .split("\n")
            .at(-1);
          reject(Object.assign(new Error(detail || error.message), { stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

/**
 * The Mac desktop host: same requests and replies as the Windows host, answered by a JXA script
 * (one osascript run per request, about a tenth of a second), plus screencapture and sips for
 * screenshots and open(1) for launching. One request at a time, so input never interleaves.
 */
export class DesktopMacHost implements DesktopHostLike {
  readonly #options: DesktopMacHostOptions;
  readonly #exec: ExecImpl;
  #script: Promise<string> | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: DesktopMacHostOptions) {
    this.#options = options;
    this.#exec = options.execImpl ?? defaultExec;
  }

  request(body: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const run = this.#queue.then(
      () => this.#handle(body, timeoutMs),
      () => this.#handle(body, timeoutMs),
    );
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #handle(
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    try {
      switch (body.op) {
        case "screenshot":
          return await this.#screenshot(body, timeoutMs);
        case "launch":
          return await this.#launch(body, timeoutMs);
        case "key":
          return await this.#jxa(
            { ...body, macChords: macChords((body.chords ?? []) as KeyStroke[][]) },
            timeoutMs,
          );
        default:
          return await this.#jxa(body, timeoutMs);
      }
    } catch (error) {
      if (error instanceof MacPermissionError)
        this.#options.onPermissionMissing?.(error.permission);
      throw error;
    }
  }

  async #scriptPath(): Promise<string> {
    this.#script ??= (async () => {
      await mkdir(this.#options.scriptDir, { recursive: true });
      const path = join(this.#options.scriptDir, "desktop-host-mac.js");
      await writeFile(path, DESKTOP_MAC_SCRIPT, "utf8");
      return path;
    })().catch((error) => {
      this.#script = null;
      throw error;
    });
    return this.#script;
  }

  async #jxa(body: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
    const script = await this.#scriptPath();
    const request = JSON.stringify({ ...body, protectedPids: this.#options.protectedPids });
    let stdout: string;
    try {
      ({ stdout } = await this.#exec(
        "/usr/bin/osascript",
        ["-l", "JavaScript", script, request],
        timeoutMs,
      ));
    } catch (error) {
      throw new Error(
        `The desktop helper failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let reply: Record<string, unknown>;
    try {
      reply = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
    } catch {
      throw new Error("The desktop helper gave an unreadable answer.");
    }
    if (reply.ok === true) return reply;
    const message = String(reply.error ?? "The desktop action failed.");
    const permission = reply.permission;
    if (permission === "accessibility" || permission === "screen" || permission === "automation") {
      throw new MacPermissionError(message, permission);
    }
    throw new Error(message);
  }

  async #screenshot(
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const geometry = await this.#jxa({ ...body, op: "geometry" }, timeoutMs);
    const left = Number(geometry.left);
    const top = Number(geometry.top);
    const width = Number(geometry.width);
    const height = Number(geometry.height);
    const folder = join(this.#options.scriptDir, "shots");
    await mkdir(folder, { recursive: true });
    const file = join(folder, `shot-${process.pid}-${Date.now()}.jpg`);
    try {
      await this.#exec(
        "/usr/sbin/screencapture",
        ["-x", "-t", "jpg", "-R", `${left},${top},${width},${height}`, file],
        timeoutMs,
      );
      const maxWidth = Number(body.maxWidth) || 1280;
      let size = await this.#imageSize(file, timeoutMs);
      if (size.width > maxWidth) {
        await this.#exec(
          "/usr/bin/sips",
          ["--resampleWidth", String(maxWidth), "-s", "formatOptions", "70", file],
          timeoutMs,
        );
        size = await this.#imageSize(file, timeoutMs);
      }
      const data = (await readFile(file)).toString("base64");
      return {
        ok: true,
        mime: "image/jpeg",
        data,
        width: size.width,
        height: size.height,
        captureWidth: width,
        captureHeight: height,
        left,
        top,
        scale: width > 0 ? size.width / width : 1,
        displays: geometry.displays,
        ...(geometry.window ? { window: geometry.window } : {}),
      };
    } finally {
      await rm(file, { force: true }).catch(() => {});
    }
  }

  async #imageSize(file: string, timeoutMs: number): Promise<{ width: number; height: number }> {
    const { stdout } = await this.#exec(
      "/usr/bin/sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", file],
      timeoutMs,
    );
    const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
    if (!width || !height) throw new Error("The screenshot could not be read.");
    return { width, height };
  }

  async #launch(
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const target = String(body.target ?? "").trim();
    const extra = typeof body.arguments === "string" ? splitArguments(body.arguments) : [];
    const before = await this.#windows(timeoutMs);
    // A web address or a path opens with its default app; a bare name is an app name.
    const isPathOrLink =
      body.shellOnly === true || target.startsWith("/") || target.startsWith("~");
    const args = isPathOrLink ? [target] : ["-a", target];
    if (extra.length) args.push("--args", ...extra);
    try {
      await this.#exec("/usr/bin/open", args, Math.min(timeoutMs, 30_000));
    } catch {
      throw new Error(
        isPathOrLink
          ? `macOS could not open "${target}".`
          : `macOS found no app called "${target}". Give the name exactly as it shows in the Applications folder, like TextEdit or Microsoft Excel.`,
      );
    }
    const known = new Set(before.map((window) => String(window.handle)));
    let fresh: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 16 && fresh.length === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      fresh = (await this.#windows(timeoutMs)).filter(
        (window) => !known.has(String(window.handle)) && !window.minimized,
      );
    }
    return {
      ok: true,
      how: "opened",
      ...(fresh[0]?.pid ? { pid: fresh[0].pid } : {}),
      newWindows: fresh,
    };
  }

  async #windows(timeoutMs: number): Promise<Record<string, unknown>[]> {
    const reply = await this.#jxa({ op: "list_windows", includeMinimized: false }, timeoutMs);
    return Array.isArray(reply.windows) ? (reply.windows as Record<string, unknown>[]) : [];
  }

  async dispose(): Promise<void> {
    await this.#queue.catch(() => undefined);
  }
}
