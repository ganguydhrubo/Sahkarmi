#!/usr/bin/env node
// Writes one latest-mac.yml for both Mac builds (Apple Silicon and Intel). Each build machine
// makes its own file that knows only its own chip; the app's update check needs both in one
// list and picks the entry whose name has "arm64" on Apple Silicon, the other one on Intel.
//
// Usage: node scripts/mac/latest-mac.mjs <version> <folder with the .zip and .dmg files> [out]

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [version, folder, outFile = join(folder ?? ".", "latest-mac.yml")] = process.argv.slice(2);
if (!version || !folder) {
  console.error("Usage: node scripts/mac/latest-mac.mjs <version> <folder> [out]");
  process.exit(1);
}

const wanted = ["arm64.zip", "arm64.dmg", "x64.zip", "x64.dmg"].map(
  (ending) => `Sahkarmi-${version}-${ending}`,
);
const present = new Set(readdirSync(folder));
const missing = wanted.filter((name) => !present.has(name));
if (missing.length > 0) {
  console.error(`Missing in ${folder}: ${missing.join(", ")}`);
  process.exit(1);
}

const entries = wanted.map((name) => {
  const path = join(folder, name);
  return {
    name,
    sha512: createHash("sha512").update(readFileSync(path)).digest("base64"),
    size: statSync(path).size,
  };
});

const lines = [`version: ${version}`, "files:"];
for (const entry of entries) {
  lines.push(`  - url: ${entry.name}`, `    sha512: ${entry.sha512}`, `    size: ${entry.size}`);
}
// Old readers use these two lines; they get the Apple Silicon build, the common Mac today.
lines.push(`path: ${entries[0].name}`, `sha512: ${entries[0].sha512}`);
lines.push(`releaseDate: '${new Date().toISOString()}'`, "");
writeFileSync(outFile, lines.join("\n"));
console.log(readFileSync(outFile, "utf8"));
