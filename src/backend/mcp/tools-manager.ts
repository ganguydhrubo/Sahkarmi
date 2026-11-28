import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { unzipBuffer } from "../antigravity-runtime";
import { isWindows, programFile } from "./platform-paths";
import { lookupCommand, setManagedToolDirectories } from "./windows-env";

/**
 * Programs MCP servers need (uv, Python, Node) found on this PC, or downloaded by Sahkarmi into
 * userData/tools/<tool>/<version> after the owner approves. Downloads come only from the tools'
 * official release pages and are checked against their published SHA-256 sums. Never `irm | iex`
 * or `curl | sh`. Windows and Mac (Apple Silicon and Intel) each get their own build.
 */

export type HttpFetch = (
  url: string,
  init?: { headers?: Record<string, string>; method?: string },
) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** The systems Sahkarmi has downloads for. Windows on ARM runs the x64 builds. */
export type ToolBuild = "win32-x64" | "darwin-arm64" | "darwin-x64";

/** uv's release file per system (github.com/astral-sh/uv; each has a .sha256 file next to it). */
export const UV_ASSETS: Record<ToolBuild, string> = {
  "win32-x64": "uv-x86_64-pc-windows-msvc.zip",
  "darwin-arm64": "uv-aarch64-apple-darwin.tar.gz",
  "darwin-x64": "uv-x86_64-apple-darwin.tar.gz",
};

/**
 * Node.js per system: the name part of node-v<version>-<name>.<ending> on nodejs.org, and what
 * nodejs.org's index.json calls that file (to pick a version that really has it).
 */
export const NODE_ASSETS: Record<
  ToolBuild,
  { name: string; ending: "zip" | "tar.gz"; listed: string }
> = {
  "win32-x64": { name: "win-x64", ending: "zip", listed: "win-x64-zip" },
  "darwin-arm64": { name: "darwin-arm64", ending: "tar.gz", listed: "osx-arm64-tar" },
  "darwin-x64": { name: "darwin-x64", ending: "tar.gz", listed: "osx-x64-tar" },
};

export function toolBuild(platform: NodeJS.Platform, arch: string): ToolBuild {
  if (platform === "win32") return "win32-x64";
  if (platform === "darwin" && (arch === "arm64" || arch === "x64")) return `darwin-${arch}`;
  throw new Error(
    "Sahkarmi has no download of this program for this system. Install it yourself, then press Re-check.",
  );
}

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/** "0.13.2" before "0.9.9": numbers are compared as numbers, the newest first. */
const newestFirst = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

function run(command: string, args: string[], timeout = 15_000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout, encoding: "utf8", ...(cwd ? { cwd } : {}) },
      (error, stdout, stderr) => (error ? reject(error) : resolve(`${stdout}${stderr}`)),
    );
  });
}

/** The system's own tar. On a Mac always /usr/bin/tar, never one that happens to be on PATH. */
function tarProgram(): string {
  if (process.platform === "darwin") return "/usr/bin/tar";
  if (process.platform === "win32") {
    return join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

export interface PythonInfo {
  path: string;
  version: [number, number];
}

/** "-V:3.13 *  C:\...\python.exe" lines from `py -0p`. */
export function parsePyLauncher(output: string): PythonInfo[] {
  const found: PythonInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /-V:(?:[^/\s]+\/)?(?:CPython)?(\d+)\.(\d+)[^\s]*\s+\*?\s*(\S.*\.exe)\s*$/i.exec(
      line.trim(),
    );
    if (match?.[3])
      found.push({ path: match[3].trim(), version: [Number(match[1]), Number(match[2])] });
  }
  return found;
}

/** ">=3.11" → [3, 11]; anything else → [3, 10]. */
export function minimumPython(requires: string | undefined): [number, number] {
  const match = /(?:>=|~=|==)\s*(\d+)\.(\d+)/.exec(requires ?? "");
  return match ? [Number(match[1]), Number(match[2])] : [3, 10];
}

const atLeast = (version: [number, number], minimum: [number, number]) =>
  version[0] > minimum[0] || (version[0] === minimum[0] && version[1] >= minimum[1]);

export interface ToolsTarget {
  /** The system the tools are for; the real one unless a test says otherwise. */
  platform?: NodeJS.Platform;
  /** The chip: "arm64" (Apple Silicon) or "x64" (Intel). */
  arch?: string;
}

export class ToolsManager {
  readonly root: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly #fetch: HttpFetch;

  constructor(
    userDataPath: string,
    fetchImpl: HttpFetch = fetch as unknown as HttpFetch,
    target: ToolsTarget = {},
  ) {
    this.root = join(userDataPath, "tools");
    this.#fetch = fetchImpl;
    this.platform = target.platform ?? process.platform;
    this.arch = target.arch ?? process.arch;
  }

  get #windows(): boolean {
    return isWindows(this.platform);
  }

  /** Throws a plain message on a system Sahkarmi has no downloads for (Linux today). */
  get #build(): ToolBuild {
    return toolBuild(this.platform, this.arch);
  }

  /** Managed tool folders, added at the end of the fresh PATH so servers can use them by name. */
  async refreshManagedPath(): Promise<string[]> {
    const directories: string[] = [];
    const list = async (folder: string) => readdir(folder).catch(() => [] as string[]);
    // Only finished version folders count (a half-done "0.9.9.partial" or .DS_Store never does).
    const versions = async (folder: string) =>
      (await list(folder)).filter((name) => VERSION.test(name)).sort(newestFirst);
    for (const version of await versions(join(this.root, "uv"))) {
      directories.push(join(this.root, "uv", version));
      break;
    }
    for (const version of await versions(join(this.root, "node"))) {
      const inner = (await list(join(this.root, "node", version))).find((name) =>
        name.startsWith("node-v"),
      );
      // node.exe sits in the folder itself on Windows; node, npm and npx sit in bin on a Mac.
      if (inner) {
        const folder = join(this.root, "node", version, inner);
        directories.push(this.#windows ? folder : join(folder, "bin"));
      }
      break;
    }
    for (const name of (await list(join(this.root, "python"))).sort(newestFirst)) {
      if (/^cpython-3\.\d+/.test(name)) {
        const folder = join(this.root, "python", name);
        directories.push(this.#windows ? folder : join(folder, "bin"));
        break;
      }
    }
    setManagedToolDirectories(directories);
    return directories;
  }

  /** uv on PATH, in its usual folders, or Sahkarmi's own copy. */
  findUv(env: NodeJS.ProcessEnv): string | null {
    const onPath = lookupCommand("uv", env, this.platform).path;
    if (onPath) return onPath;
    const file = programFile("uv", this.platform);
    const home = (this.#windows ? env.USERPROFILE : env.HOME) ?? "";
    const candidates = home
      ? [join(home, ".local", "bin", file), join(home, ".cargo", "bin", file)]
      : [];
    // Homebrew's folders, in case the app was started before the Terminal PATH was read.
    if (this.platform === "darwin") candidates.push("/opt/homebrew/bin/uv", "/usr/local/bin/uv");
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  /**
   * npm's start file for a Node.js program: next to node.exe on Windows, in ../lib on a Mac
   * (bin/node and lib/node_modules/npm).
   */
  npmCliFor(node: string): string {
    return this.#windows
      ? join(dirname(node), "node_modules", "npm", "bin", "npm-cli.js")
      : join(dirname(node), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  }

  /** Node.js with its own npm, on PATH or Sahkarmi's own copy. */
  findNode(env: NodeJS.ProcessEnv): { node: string; npmCli: string } | null {
    const node = lookupCommand("node", env, this.platform).path;
    if (!node) return null;
    const candidates = [this.npmCliFor(node)];
    if (!this.#windows) {
      // Homebrew and others put a link in bin; npm lives beside the real program.
      try {
        candidates.push(this.npmCliFor(realpathSync(node)));
      } catch {
        // A broken link: the first place is still tried.
      }
    }
    const npmCli = candidates.find((candidate) => existsSync(candidate));
    return npmCli ? { node, npmCli } : null;
  }

  /** A real Python of at least `minimum` (the Store stub never counts, MCP-9); newest first. */
  async findPython(env: NodeJS.ProcessEnv, minimum: [number, number]): Promise<PythonInfo | null> {
    const found: PythonInfo[] = [];
    if (this.#windows) {
      const launcher = lookupCommand("py", env, this.platform).path;
      if (launcher) found.push(...parsePyLauncher(await run(launcher, ["-0p"]).catch(() => "")));
    }
    // A Mac has no "py" launcher, and its Python is usually called python3.
    const names = this.#windows ? ["python"] : ["python3.11", "python3", "python"];
    const seen = new Set<string>();
    for (const name of names) {
      const python = lookupCommand(name, env, this.platform).path;
      if (!python || seen.has(python)) continue;
      seen.add(python);
      // Apple's /usr/bin/python3 is too old (3.9) and, without Apple's developer tools, only
      // opens a window that offers to install them. It is never started.
      if (this.platform === "darwin" && /^\/usr\/bin\/python[0-9.]*$/.test(python)) continue;
      const text = await run(python, [
        "-c",
        "import sys;print(sys.version_info[0],sys.version_info[1])",
      ]).catch(() => "");
      const match = /(\d+)\s+(\d+)/.exec(text);
      if (match) found.push({ path: python, version: [Number(match[1]), Number(match[2])] });
    }
    const usable = found.filter(
      (entry) => atLeast(entry.version, minimum) && existsSync(entry.path),
    );
    // 3.11 first when allowed (what most AI projects test with), then the newest.
    usable.sort((a, b) => {
      const score = (entry: PythonInfo) => (entry.version[1] === 11 ? 1000 : 0) + entry.version[1];
      return score(b) - score(a);
    });
    return usable[0] ?? null;
  }

  /** Latest uv release version, read from GitHub's /releases/latest redirect (no API call). */
  async latestUvVersion(): Promise<string> {
    const response = await this.#fetch("https://github.com/astral-sh/uv/releases/latest", {
      headers: { "User-Agent": "Sahkarmi" },
    });
    const version = /\/tag\/v?([0-9]+\.[0-9]+\.[0-9]+)$/.exec(response.url)?.[1];
    if (!version) throw new Error("Could not find the latest uv version. Try again later.");
    return version;
  }

  uvDirectory(version: string): string {
    return join(this.root, "uv", version);
  }

  /** Where uv is after `installUv`: uv.exe on Windows, uv on a Mac, in the version folder. */
  uvExecutable(version: string): string {
    return join(this.uvDirectory(version), programFile("uv", this.platform));
  }

  /** The uv download for this system and chip, and its published checksum file. */
  uvUrls(version: string): { file: string; archive: string; sha256: string } {
    const file = UV_ASSETS[this.#build];
    const archive = `https://github.com/astral-sh/uv/releases/download/${version}/${file}`;
    return { file, archive, sha256: `${archive}.sha256` };
  }

  /** Downloads uv for this system, checks it against the release's .sha256 file, unpacks it. */
  async installUv(version: string, log: (line: string) => void = () => {}): Promise<string> {
    if (!VERSION.test(version)) throw new Error("Unexpected uv version.");
    const target = this.uvDirectory(version);
    const exe = this.uvExecutable(version);
    if (existsSync(exe)) return exe;
    const urls = this.uvUrls(version);
    const expected = (await this.#text(urls.sha256)).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    log(`Downloading ${urls.archive}`);
    const data = await this.#download(urls.archive);
    verifySha256(data, expected, urls.file);
    log(`SHA-256 matches (${expected.slice(0, 16)}…)`);
    // The Mac archive wraps uv and uvx in one folder (uv-aarch64-apple-darwin); that folder is
    // left out, so uv sits in the version folder exactly as uv.exe does on Windows.
    await this.#unpack(data, target, urls.file.endsWith(".zip") ? "zip" : "tar.gz", 1);
    if (!existsSync(exe)) throw new Error(`The uv download did not contain ${basename(exe)}.`);
    await this.#allowRunning([exe, join(target, programFile("uvx", this.platform))]);
    await this.refreshManagedPath();
    return exe;
  }

  /** The newest Node.js LTS version that has a build for this system, and where to get it. */
  async latestNodeLts(): Promise<{
    version: string;
    archive: string;
    shasums: string;
    file: string;
  }> {
    const index = (await (await this.#fetch("https://nodejs.org/dist/index.json")).json()) as {
      version?: string;
      lts?: unknown;
      files?: string[];
    }[];
    const listed = NODE_ASSETS[this.#build].listed;
    const release = index.find((entry) => entry.lts && entry.files?.includes(listed));
    const version = release?.version?.replace(/^v/, "");
    if (!version || !VERSION.test(version))
      throw new Error("Could not find the current Node.js version.");
    return { version, ...this.nodeUrls(version) };
  }

  /** node-v22.1.0-win-x64, node-v22.1.0-darwin-arm64 …: the folder inside the download. */
  nodeFolderName(version: string): string {
    return `node-v${version}-${NODE_ASSETS[this.#build].name}`;
  }

  nodeUrls(version: string): { file: string; archive: string; shasums: string } {
    const file = `${this.nodeFolderName(version)}.${NODE_ASSETS[this.#build].ending}`;
    return {
      file,
      archive: `https://nodejs.org/dist/v${version}/${file}`,
      shasums: `https://nodejs.org/dist/v${version}/SHASUMS256.txt`,
    };
  }

  /** Where Node.js is after `installNode`: <folder>\node.exe on Windows, <folder>/bin/node on a Mac. */
  nodeExecutable(version: string): string {
    const folder = join(this.root, "node", version, this.nodeFolderName(version));
    return this.#windows ? join(folder, "node.exe") : join(folder, "bin", "node");
  }

  /** Downloads portable Node.js, checks it against SHASUMS256.txt, unpacks it. */
  async installNode(version: string, log: (line: string) => void = () => {}): Promise<string> {
    if (!VERSION.test(version)) throw new Error("Unexpected Node.js version.");
    const exe = this.nodeExecutable(version);
    if (existsSync(exe)) return exe;
    const urls = this.nodeUrls(version);
    const sums = await this.#text(urls.shasums);
    const expected = sums
      .split(/\r?\n/)
      .find((line) => line.trim().endsWith(` ${urls.file}`))
      ?.trim()
      .split(/\s+/)[0]
      ?.toLowerCase();
    if (!expected) throw new Error("Node.js did not publish a checksum for that file.");
    log(`Downloading ${urls.archive}`);
    const data = await this.#download(urls.archive);
    verifySha256(data, expected, urls.file);
    log(`SHA-256 matches (${expected.slice(0, 16)}…)`);
    // The whole tree is kept as it is: on a Mac npm and npx in bin are links into lib.
    await this.#unpack(data, join(this.root, "node", version), NODE_ASSETS[this.#build].ending, 0);
    if (!existsSync(exe)) {
      throw new Error(`The Node.js download did not contain ${basename(exe)}.`);
    }
    await this.#allowRunning([exe]);
    await this.refreshManagedPath();
    return exe;
  }

  /** Where `uv python install` puts Pythons, inside Sahkarmi's tools folder (no system change). */
  get pythonDirectory(): string {
    return join(this.root, "python");
  }

  async #text(url: string): Promise<string> {
    const response = await this.#fetch(url, { headers: { "User-Agent": "Sahkarmi" } });
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    return response.text();
  }

  async #download(url: string): Promise<Buffer> {
    const response = await this.#fetch(url, { headers: { "User-Agent": "Sahkarmi" } });
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }

  /** A Mac only starts a file that has the "may run" permission; Windows goes by the ending. */
  async #allowRunning(files: string[]): Promise<void> {
    if (this.#windows) return;
    for (const file of files) await chmod(file, 0o755).catch(() => undefined);
  }

  /**
   * Unpacks a checked download into `target` (through a ".partial" folder, so a half-done unpack
   * is never used). `strip` leaves out that many leading folders of a tar archive.
   */
  async #unpack(
    data: Buffer,
    target: string,
    kind: "zip" | "tar.gz",
    strip: number,
  ): Promise<void> {
    const temporary = `${target}.partial`;
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    if (kind === "zip") {
      await unzipBuffer(data, temporary);
    } else {
      // tar keeps the "may run" permissions and the links inside the archive. It is given only
      // names inside the tools folder (never a "C:" path, which some tars read as a network host).
      const archive = `${temporary}.tar.gz`;
      await writeFile(archive, data);
      try {
        await run(
          tarProgram(),
          [
            "-xzf",
            basename(archive),
            "-C",
            basename(temporary),
            ...(strip > 0 ? ["--strip-components", String(strip)] : []),
          ],
          5 * 60_000,
          dirname(target),
        );
      } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        throw new Error(
          `Could not unpack the download: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        await rm(archive, { force: true });
      }
    }
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    await rename(temporary, target);
  }
}

export function verifySha256(data: Buffer, expected: string, label: string): void {
  const actual = createHash("sha256").update(data).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) {
    throw new Error(`${label} failed its SHA-256 check, so it was not used.`);
  }
}
