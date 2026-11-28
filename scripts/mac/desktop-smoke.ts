// Real proof that desktop app control works on this Mac, with no Electron:
//   bun scripts/mac/desktop-smoke.ts [out-folder]
//
// Through the app's own Mac host and tool parser it opens a text file in TextEdit, lists and
// focuses the window, reads the accessibility tree, clicks into the text, clears it with
// cmd+a delete, types a line key by key, pastes a Bengali line, reads both back, scrolls, takes a
// screenshot (saved in the out folder), checks that a protected window refuses a click, and
// closes the window.
// Exit code 0 = all good, 1 = something is broken, 2 = a macOS permission (Accessibility,
// Screen Recording or Automation) is missing on this machine, so it could not be verified here.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  describeScreenshot,
  formatUiTree,
  formatWindows,
} from "../../src/backend/desktop/desktop-control";
import { DesktopMacHost, MacPermissionError } from "../../src/backend/desktop/desktop-mac-host";
import { parseDesktopCall } from "../../src/backend/desktop/desktop-tools";

const out = resolve(process.argv[2] ?? "desktop-smoke-output");
const LINE = "Hello from Sahkarmi 42";
const BENGALI = "নমস্কার, রিপোর্ট তৈরি";

function log(message: string): void {
  console.log(`[desktop-smoke] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((done) => {
    execFile(file, args, { encoding: "utf8" }, (_error, stdout) => done(String(stdout ?? "")));
  });
}

type Reply = Record<string, unknown>;
type Node = {
  type?: string;
  value?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

async function main(): Promise<number> {
  if (process.platform !== "darwin") {
    log("This proof runs on a Mac only.");
    return 1;
  }
  await mkdir(out, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "sk-desktop-smoke-"));
  const host = new DesktopMacHost({
    scriptDir: join(work, "desktop"),
    protectedPids: [process.pid],
  });
  const call = async (tool: string, args: Reply, timeoutMs = 60_000): Promise<Reply> => {
    const parsed = parseDesktopCall(tool, args);
    const started = performance.now();
    if (parsed.findElement) {
      const found = await host.request(parsed.findElement, timeoutMs);
      const element = found.element as Reply;
      const x = Number(element.x) + Math.floor(Number(element.width) / 2);
      const y = Number(element.y) + Math.floor(Number(element.height) / 2);
      const reply = await host.request({ ...parsed.request, x, y }, timeoutMs);
      log(`ok   ${parsed.summary} (${Math.round(performance.now() - started)} ms)`);
      return reply;
    }
    const reply = await host.request(parsed.request, timeoutMs);
    log(`ok   ${parsed.summary} (${Math.round(performance.now() - started)} ms)`);
    return reply;
  };
  const textArea = async (pid: number): Promise<Node> => {
    const reply = await call("read_ui", { pid, maxNodes: 300 });
    const nodes = (reply.nodes ?? []) as Node[];
    const area = nodes.find((node) => node.type === "TextArea" && Number(node.width) > 0);
    if (!area) {
      console.log(formatUiTree(reply));
      throw new Error("TextEdit shows no text area in the accessibility tree.");
    }
    return area;
  };

  try {
    const permissions = await host.request({ op: "permissions" });
    log(
      `permissions: accessibility ${permissions.accessibility}, screen ${permissions.screen}, automation ${permissions.automation}`,
    );

    const file = join(work, "sahkarmi-desktop-smoke.txt");
    await writeFile(file, "start\n", "utf8");
    const launched = await call("launch_app", { target: file }, 90_000);
    let pid = Number(launched.pid) || 0;
    if (!pid) {
      await sleep(2_000);
      const listed = await call("list_windows", {});
      const windows = (listed.windows ?? []) as Reply[];
      pid = Number(windows.find((window) => window.process === "TextEdit")?.pid) || 0;
      if (!pid) {
        console.log(formatWindows(listed));
        throw new Error("TextEdit opened no window.");
      }
    }
    log(`TextEdit pid ${pid}`);
    const listed = await call("list_windows", {});
    console.log(formatWindows(listed));

    await call("focus_window", { pid });
    let area = await textArea(pid);
    const cx = Number(area.x) + Math.floor(Number(area.width) / 2);
    const cy = Number(area.y) + Math.min(40, Math.floor(Number(area.height) / 2));
    await call("click", { x: cx, y: cy });
    await call("key", { keys: "cmd+a delete" });
    await call("type", { text: LINE, method: "keys" });
    await sleep(400);
    area = await textArea(pid);
    if (!String(area.value ?? "").includes(LINE)) {
      throw new Error(`Typed text not read back. The text area holds: "${area.value ?? ""}"`);
    }
    log("ok   typed text read back");

    await call("key", { keys: "cmd+a" });
    await call("type", { text: BENGALI });
    await sleep(400);
    area = await textArea(pid);
    if (!String(area.value ?? "").includes(BENGALI)) {
      throw new Error(
        `Pasted Bengali text not read back. The text area holds: "${area.value ?? ""}"`,
      );
    }
    log("ok   pasted Bengali text read back");

    await call("scroll", { x: cx, y: cy, deltaY: 2 });

    const shot = await call("screenshot", { pid, maxWidth: 1280 }, 60_000);
    console.log(describeScreenshot(shot));
    if (!(Number(shot.width) > 0) || !String(shot.data ?? "")) throw new Error("Empty screenshot.");
    await writeFile(join(out, "textedit-window.jpg"), Buffer.from(String(shot.data), "base64"));
    const screen = await call("screenshot", {}, 60_000);
    await writeFile(join(out, "screen.jpg"), Buffer.from(String(screen.data), "base64"));

    // Sahkarmi's own windows are off limits: here TextEdit plays that part.
    const guarded = new DesktopMacHost({ scriptDir: join(work, "desktop"), protectedPids: [pid] });
    try {
      await guarded.request(parseDesktopCall("click", { x: cx, y: cy }).request);
      throw new Error("A protected window took a click.");
    } catch (error) {
      if (!String((error as Error).message).includes("Sahkarmi's own window")) throw error;
      log("ok   a protected window refused the click");
    }

    const closed = await call("close_window", { pid });
    log(`close_window: closed=${String(closed.closed)}`);
    log("ALL PASSED");
    return 0;
  } catch (error) {
    if (error instanceof MacPermissionError) {
      log(`NOT VERIFIABLE HERE: ${error.permission} permission missing. ${error.message}`);
      return 2;
    }
    log(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await run("/usr/bin/osascript", ["-e", 'tell application "TextEdit" to quit saving no']);
    await host.dispose();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
