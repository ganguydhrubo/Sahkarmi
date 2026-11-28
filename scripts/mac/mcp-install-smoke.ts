// Real proof that "MCP servers: install for me" works on this computer, with no Electron:
//   bun scripts/mac/mcp-install-smoke.ts [--keep]
//
// Through the app's own installer it fetches Sahkarmi's managed uv and Node.js (checked SHA-256),
// installs one small Python server (PyPI mcp-server-time) and one small Node server (npm
// @modelcontextprotocol/server-memory) into a scratch folder, then runs the app's own handshake
// (initialize + tools/list) on each. Made for the GitHub macOS runners; it runs on Windows too.
// Exit code 0 = all good, 1 = something failed.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testServer } from "../../src/backend/mcp/handshake";
import { McpInstaller } from "../../src/backend/mcp/installer";
import { serverEnvironment } from "../../src/backend/mcp/windows-env";
import type { McpCandidate, McpRepoAnalysis, McpServerInput } from "../../src/shared/ipc";

const keep = process.argv.includes("--keep");
const INSTALL_LIMIT_MS = 15 * 60_000;

const SERVERS: { name: string; install: McpCandidate["install"]; runtime: "node" | "python" }[] = [
  {
    name: "smoke-time",
    runtime: "python",
    install: {
      type: "pypi",
      package: "mcp-server-time",
      version: "2026.11.27",
      script: "mcp-server-time",
      requiresPython: ">=3.10",
    },
  },
  {
    name: "smoke-memory",
    runtime: "node",
    install: { type: "npm", package: "@modelcontextprotocol/server-memory", version: "2.2.2" },
  },
];

function log(message: string): void {
  console.log(`[mcp-install-smoke] ${message}`);
}

function analysis(candidate: McpCandidate): McpRepoAnalysis {
  return {
    id: `smoke-${candidate.id}`,
    repo: "smoke/test",
    url: "https://github.com/smoke/test",
    commit: "",
    subPath: "",
    kind: "server",
    notMcp: [],
    evidence: [],
    candidates: [candidate],
    cli: null,
    heavy: false,
    warnings: [],
    truncated: false,
  } as unknown as McpRepoAnalysis;
}

async function main(): Promise<number> {
  const userData = await mkdtemp(join(tmpdir(), "sk-mcp-smoke-"));
  const saved: McpServerInput[] = [];
  const installer = new McpInstaller(
    userData,
    {
      saveServer: async (input) => {
        saved.push(input);
        return [];
      },
      testServer: async () => [],
      addSkill: async () => "",
      recheck: async () => [],
      env: () => serverEnvironment({}),
    },
    {
      root: join(userData, "servers"),
      extraEnv: {
        npm_config_cache: join(userData, "npm-cache"),
        UV_CACHE_DIR: join(userData, "uv-cache"),
        UV_PYTHON_INSTALL_DIR: join(userData, "uv-python"),
      },
    },
  );
  let failed = 0;
  const runPlan = async (label: string, planId: string): Promise<boolean> => {
    const started = performance.now();
    const job = installer.run(planId);
    const timer = setTimeout(() => void installer.cancel(job.id), INSTALL_LIMIT_MS);
    const done = await installer.wait(job.id, 500);
    clearTimeout(timer);
    const took = ((performance.now() - started) / 1000).toFixed(1);
    if (done.state !== "done") {
      log(`FAIL ${label}: ${done.state} after ${took} s: ${done.error ?? ""}`);
      console.log(done.log.slice(-3000));
      return false;
    }
    log(`ok   ${label} (${took} s)`);
    return true;
  };
  try {
    log(`platform ${process.platform} ${process.arch}, folder ${userData}`);
    for (const tool of ["uv", "node"] as const) {
      const plan = await installer.planTool(tool);
      if (!(await runPlan(`managed ${tool}`, plan.id))) return 1;
    }
    const managed = await installer.tools.refreshManagedPath();
    log(`managed tool folders: ${managed.join(", ")}`);

    for (const server of SERVERS) {
      const candidate: McpCandidate = {
        id: server.name,
        label: server.name,
        runtime: server.runtime,
        install: server.install,
        evidence: [],
        requiredEnv: [],
        placeholders: [],
        needs: [server.runtime === "node" ? "node" : "uv"],
      };
      const before = saved.length;
      const plan = await installer.planCandidate(analysis(candidate), candidate, server.name, {});
      if (!(await runPlan(`install ${server.name}`, plan.id))) {
        failed++;
        continue;
      }
      const input = saved[before];
      if (!input?.command) {
        log(`FAIL ${server.name}: the installer saved no command`);
        failed++;
        continue;
      }
      log(`${server.name}: ${input.command} ${(input.args ?? []).join(" ")}`);
      const result = await testServer(
        {
          transport: "stdio",
          command: input.command,
          args: input.args ?? [],
          env: serverEnvironment(input.env ?? {}),
          ...(input.cwd ? { cwd: input.cwd } : {}),
          url: "",
          headers: {},
        },
        { timeoutMs: 60_000, firstRun: true },
      );
      if (!result.ok || result.toolCount < 1) {
        log(`FAIL ${server.name} handshake: ${result.error ?? "no tools"}`);
        console.log(result.stderrTail);
        failed++;
        continue;
      }
      log(
        `ok   ${server.name} handshake: ${result.toolCount} tools (${result.toolNames.join(", ")})`,
      );
    }
  } finally {
    if (!keep) await rm(userData, { recursive: true, force: true }).catch(() => {});
  }
  log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
