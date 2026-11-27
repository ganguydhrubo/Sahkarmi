import { describe, expect, it } from "vitest";
import type { ProviderUsageSummary } from "../../../shared/ipc";
import { mostUsedFirst, usageOf } from "./UsageRings";

const ai = (
  provider: string,
  limits: Array<{ usedPercent: number | null; status?: string; resetsAt?: string }>,
) =>
  ({
    provider,
    limits: limits.map((limit) => ({ label: "5 hours", ...limit })),
  }) as unknown as ProviderUsageSummary;

describe("the one usage ring", () => {
  const now = Date.parse("2026-11-27T10:00:00Z");

  it("puts the AI closest to its limit first, whatever order they were connected in", () => {
    const order = mostUsedFirst(
      [
        ai("codex", [{ usedPercent: 20 }]),
        ai("claude", [{ usedPercent: 85 }]),
        ai("antigravity", [{ usedPercent: 40 }]),
      ],
      now,
    ).map((provider) => provider.provider);
    expect(order).toEqual(["claude", "antigravity", "codex"]);
  });

  it("lets a provider's own 'limited' status outrank a higher number", () => {
    const order = mostUsedFirst(
      [ai("codex", [{ usedPercent: 90 }]), ai("claude", [{ usedPercent: 60, status: "limited" }])],
      now,
    ).map((provider) => provider.provider);
    expect(order).toEqual(["claude", "codex"]);
  });

  it("ignores a limit window that has already reset", () => {
    const used = usageOf(
      ai("codex", [{ usedPercent: 99, resetsAt: "2026-11-27T09:00:00Z" }, { usedPercent: 10 }]),
      now,
    );
    expect(used).toEqual({ highest: 10, level: "ok" });
    expect(usageOf(ai("codex", [{ usedPercent: 96 }]), now).level).toBe("high");
    expect(usageOf(ai("codex", [{ usedPercent: 81 }]), now).level).toBe("mid");
  });
});
