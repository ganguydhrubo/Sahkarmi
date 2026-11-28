/**
 * macOS: memory that can be used right now.
 *
 * os.freemem() on a Mac counts only pages nothing has touched, which is a few hundred MB on a
 * healthy Mac, because macOS fills spare memory with cache it gives back at once. Read that way,
 * Sahkarmi would think every Mac is always out of memory, make coworkers wait and put browser
 * pages to sleep. `vm_stat` tells the real picture: free + inactive + speculative + purgeable
 * pages, close to what Activity Monitor calls available.
 */
import { execFile, execFileSync } from "node:child_process";
import { freemem } from "node:os";

/** Bytes that can be used at once, from the text `vm_stat` prints; null when it is unreadable. */
export function availableBytesFromVmStat(text: string): number | null {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
  const pages = (label: string): number => {
    const match = new RegExp(`^${label}:\\s+(\\d+)\\.?\\s*$`, "m").exec(text);
    return match ? Number(match[1]) : 0;
  };
  const free = pages("Pages free");
  const reusable = pages("Pages inactive") + pages("Pages speculative") + pages("Pages purgeable");
  if (free + reusable <= 0) return null;
  return (free + reusable) * pageSize;
}

const FRESH_MS = 5_000;
let cached: { bytes: number; at: number } | null = null;
let refreshing = false;

/**
 * The newest reading, at most a few seconds old. The first call reads once in line (about
 * 10 ms); later calls answer from memory at once and refresh in the background.
 */
export function macAvailableMemory(now: number = Date.now()): number {
  if (!cached) {
    try {
      const bytes = availableBytesFromVmStat(
        execFileSync("/usr/bin/vm_stat", { encoding: "utf8", timeout: 2_000 }),
      );
      cached = { bytes: bytes ?? freemem(), at: now };
    } catch {
      cached = { bytes: freemem(), at: now };
    }
    return cached.bytes;
  }
  if (now - cached.at > FRESH_MS && !refreshing) {
    refreshing = true;
    execFile("/usr/bin/vm_stat", { timeout: 2_000 }, (error, stdout) => {
      refreshing = false;
      const bytes = error ? null : availableBytesFromVmStat(String(stdout));
      if (bytes !== null) cached = { bytes, at: Date.now() };
      else if (cached) cached.at = Date.now();
    });
  }
  return cached.bytes;
}
