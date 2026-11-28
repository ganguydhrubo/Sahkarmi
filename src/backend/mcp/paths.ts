import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Python and many build tools break on Windows paths with spaces or non-ASCII letters (the
 * MoneyPrinterTurbo README warns about it). Installs go under userData\mcp when that path is
 * plain, else its 8.3 short form, else a fixed folder on the system drive (audit §11.6).
 */
export function isPlainPath(path: string): boolean {
  return /^[A-Za-z0-9_\-.:~\\/]+$/.test(path);
}

/**
 * Windows' old 260-character limit still applies to pip and many tools unless long paths are
 * switched on. Real packages nest deep inside a venv: litellm (a MoneyPrinterTurbo dependency)
 * has a 176-character file path under site-packages, which failed under a 62-character folder.
 */
export const MAX_ROOT_LENGTH = 80;
/** Without long paths the root must stay short: <root>\<name 24>\.venv\Lib\site-packages\ + 176. */
export const MAX_ROOT_LENGTH_SHORT_PATHS = 32;

export type LongPathsCheck = () => Promise<boolean>;

/** Whether Windows long paths are on (HKLM\...\FileSystem LongPathsEnabled = 1). */
export const longPathsEnabled: LongPathsCheck = () =>
  new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(true);
      return;
    }
    execFile(
      "reg.exe",
      ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "/v", "LongPathsEnabled"],
      { windowsHide: true, timeout: 5000, encoding: "utf8" },
      (error, stdout) => resolve(!error && /LongPathsEnabled\s+REG_DWORD\s+0x0*1\b/i.test(stdout)),
    );
  });

export type ShortPath = (path: string) => Promise<string | null>;

/** Windows' 8.3 name for an existing folder (null when 8.3 names are switched off). */
export const shortPath: ShortPath = (path) =>
  new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve(null);
      return;
    }
    execFile(
      "cmd.exe",
      ["/d", "/s", "/c", `for %I in ("${path.replace(/"/g, "")}") do @echo %~sI`],
      { windowsHide: true, timeout: 5000, encoding: "utf8" },
      (error, stdout) => resolve(error ? null : stdout.trim().split(/\r?\n/).pop()?.trim() || null),
    );
  });

/**
 * Where servers are installed. Windows: userData\mcp when plain and short enough, else its 8.3
 * short form, else <drive>\Sahkarmi-mcp\<user>. Mac: the app's own folder is under
 * "Application Support" (a space), so servers go to ~/.sahkarmi-mcp; a Mac has no 260-character
 * limit, so only spaces and non-ASCII letters matter there.
 */
export async function installRoot(
  userDataPath: string,
  options: {
    shortPath?: ShortPath;
    longPaths?: LongPathsCheck;
    systemDrive?: string;
    username?: string;
    /** The system to choose for; the real one unless a test says otherwise. */
    platform?: NodeJS.Platform;
    /** The owner's home folder (Mac). */
    home?: string;
  } = {},
): Promise<string> {
  const platform = options.platform ?? process.platform;
  const preferred = join(userDataPath, "mcp");
  const user = (name: string | undefined) =>
    (name ?? "owner").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || "owner";
  if (platform !== "win32") {
    const home = options.home ?? homedir();
    const candidates = [
      preferred,
      join(home, ".sahkarmi-mcp"),
      // A home folder with a space or non-ASCII letters: the Mac's folder every user may write to.
      ...(platform === "darwin"
        ? [join("/Users/Shared", "Sahkarmi-mcp", user(options.username ?? process.env.USER))]
        : []),
    ];
    for (const candidate of candidates) {
      if (!isPlainPath(candidate)) continue;
      try {
        await mkdir(candidate, { recursive: true });
        return candidate;
      } catch {
        // Not writable: the next place is tried.
      }
    }
    await mkdir(preferred, { recursive: true });
    return preferred;
  }
  const limit = (await (options.longPaths ?? longPathsEnabled)())
    ? MAX_ROOT_LENGTH
    : MAX_ROOT_LENGTH_SHORT_PATHS;
  const fits = (path: string) => isPlainPath(path) && path.length <= limit;
  await mkdir(preferred, { recursive: true });
  if (fits(preferred)) return preferred;
  const short = await (options.shortPath ?? shortPath)(preferred);
  if (short && fits(short)) return short;
  const drive = options.systemDrive ?? process.env.SystemDrive ?? "C:";
  const fallback = join(
    `${drive}\\`,
    "Sahkarmi-mcp",
    user(options.username ?? process.env.USERNAME),
  );
  await mkdir(fallback, { recursive: true });
  return fallback;
}

/** A folder name for a server: its name, plain letters only. */
export function serverFolderName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 24) || "server";
}
