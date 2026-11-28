/**
 * macOS: an app opened from Finder or the Dock gets only the system folders in its PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin). Programs the owner installed with Homebrew, npm, bun or uv
 * (node, npx, uvx, python3, claude, codex …) are then "not found" by coworkers and MCP servers,
 * although they work in Terminal. This gives Sahkarmi the same PATH as the owner's Terminal.
 */
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, posix } from "node:path";

const START = "__SAHKARMI_PATH_START__";
const END = "__SAHKARMI_PATH_END__";

/** Folders where Mac owners usually have their tools, used even when the shell gives nothing. */
export function usualMacToolFolders(home: string = homedir()): string[] {
  return [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    posix.join(home, ".local", "bin"),
    posix.join(home, ".bun", "bin"),
    posix.join(home, ".npm-global", "bin"),
    posix.join(home, ".cargo", "bin"),
  ];
}

/** `current` first, then every new folder of `extra`, each folder once. */
export function mergePaths(current: string, extra: string[], separator: string = delimiter) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const folder of [...current.split(separator), ...extra]) {
    const clean = folder.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    merged.push(clean);
  }
  return merged.join(separator);
}

/** The PATH between the marks; a shell's own start-up words around it are ignored. */
export function pathFromShellOutput(output: string): string | null {
  const start = output.indexOf(START);
  const end = output.indexOf(END, start + START.length);
  if (start < 0 || end < 0) return null;
  const path = output.slice(start + START.length, end).trim();
  return path.includes("/") ? path : null;
}

type Runner = (
  file: string,
  args: string[],
  options: { timeout: number; env: NodeJS.ProcessEnv },
) => Promise<string>;

const runShell: Runner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, maxBuffer: 256 * 1024 }, (error, stdout) => {
      if (error && !stdout) reject(error);
      else resolve(String(stdout));
    });
  });

/**
 * Reads the PATH of the owner's login shell (the one Terminal uses) and adds it to this
 * process, so every program Sahkarmi starts later can find the owner's tools. Never throws and
 * never waits longer than five seconds; the usual tool folders are added at once.
 */
export async function useTerminalPathOnMac(
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    home?: string;
    run?: Runner;
  } = {},
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return null;
  const env = options.env ?? process.env;
  const usual = usualMacToolFolders(options.home);
  env.PATH = mergePaths(env.PATH ?? "", usual, ":");
  try {
    const shell = env.SHELL?.startsWith("/") ? env.SHELL : "/bin/zsh";
    const output = await (options.run ?? runShell)(
      shell,
      ["-ilc", `printf '%s%s%s' '${START}' "$PATH" '${END}'`],
      { timeout: 5_000, env },
    );
    const fromShell = pathFromShellOutput(output);
    if (fromShell) env.PATH = mergePaths(env.PATH ?? "", fromShell.split(":"), ":");
  } catch {
    // A slow or broken shell profile: the usual folders above are already in place.
  }
  return env.PATH ?? null;
}
