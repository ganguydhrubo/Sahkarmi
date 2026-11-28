import { accessSync, constants, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The few path pieces that differ between Windows and a Mac, in one place. Every helper takes the
 * system as its last argument (the real one by default), so tests can check both on any machine.
 */

export function isWindows(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32";
}

/** "uv" → "uv.exe" on Windows, "uv" everywhere else. */
export function programFile(name: string, platform: NodeJS.Platform = process.platform): string {
  return isWindows(platform) ? `${name}.exe` : name;
}

/** Where a Python environment keeps its programs: .venv\Scripts on Windows, .venv/bin elsewhere. */
export function venvBin(venv: string, platform: NodeJS.Platform = process.platform): string {
  return join(venv, isWindows(platform) ? "Scripts" : "bin");
}

/** The Python inside an environment. */
export function venvPython(venv: string, platform: NodeJS.Platform = process.platform): string {
  return join(venvBin(venv, platform), programFile("python", platform));
}

/** A program a Python package installed into an environment (its "console script"). */
export function venvScript(
  venv: string,
  script: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return join(venvBin(venv, platform), programFile(script, platform));
}

/**
 * Whether `file` can be started. Windows: it exists (the ending decides). Mac and Linux: it is a
 * file (not a folder) with the "may run" permission set.
 */
export function isRunnableFile(
  file: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    if (isWindows(platform)) return statSync(file).isFile();
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * One word of a command, quoted the way the system's own terminal wants it: double quotes on
 * Windows, single quotes on a Mac (where a "$" inside double quotes would be read as a variable).
 */
export function quoteWord(word: string, platform: NodeJS.Platform = process.platform): string {
  if (isWindows(platform)) {
    return /[\s"&|<>^]/.test(word) || word === "" ? `"${word.replace(/"/g, '\\"')}"` : word;
  }
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}
