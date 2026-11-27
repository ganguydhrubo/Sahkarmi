import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  type AgentProviderId,
  PROVIDER_LABELS,
  type ProviderUsageSummary,
} from "../../../shared/ipc";
import { ProviderLogo } from "./ProviderLogo";

const NAMES: Partial<Record<AgentProviderId, string>> = {
  codex: "ChatGPT",
  claude: "Claude",
  antigravity: "Antigravity",
  opencode: "OpenCode",
};
const REFRESH_MS = 60_000;

export type UsageLevel = "ok" | "mid" | "high";

/** How full one AI's limit is right now. A window past its reset time no longer counts. */
export function usageOf(
  provider: ProviderUsageSummary,
  now = Date.now(),
): { highest: number; level: UsageLevel } {
  const live = provider.limits.filter(
    (limit) => !limit.resetsAt || Date.parse(limit.resetsAt) >= now,
  );
  const highest = Math.max(0, ...live.map((limit) => limit.usedPercent ?? 0));
  // The provider's own status counts too: Claude warns from 75 % of a window.
  const level: UsageLevel =
    highest >= 95 || live.some((limit) => limit.status === "limited")
      ? "high"
      : highest >= 80 || live.some((limit) => limit.status === "warning")
        ? "mid"
        : "ok";
  return { highest, level };
}

const LEVEL_ORDER: Record<UsageLevel, number> = { high: 2, mid: 1, ok: 0 };

/** The AI that needs the owner's eye first: the worst level, then the fullest. */
export function mostUsedFirst(
  providers: ProviderUsageSummary[],
  now = Date.now(),
): ProviderUsageSummary[] {
  return [...providers].sort((left, right) => {
    const a = usageOf(left, now);
    const b = usageOf(right, now);
    return LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || b.highest - a.highest;
  });
}

/**
 * One small ring in the rail for all connected AIs. It shows the AI closest to its limit; a
 * "+2" says how many more are connected. Pointing at it lists every AI with its real limits.
 * However many AIs are connected, the rail keeps the same single ring. Nothing is estimated:
 * only AIs that report a limit appear.
 */
export function UsageRings(props: { onOpenUsage: () => void }) {
  const [providers, setProviders] = createSignal<ProviderUsageSummary[]>([]);
  const [open, setOpen] = createSignal(false);

  const load = async () => {
    try {
      const overview = await window.sahkarmi.usage.overview();
      setProviders(
        overview.providers.filter((provider) =>
          provider.limits.some((limit) => limit.usedPercent !== null),
        ),
      );
    } catch {
      // Usage is optional; the ring simply stays hidden.
    }
  };

  onMount(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    onCleanup(() => clearInterval(timer));
  });

  const ordered = createMemo(() => mostUsedFirst(providers()));
  const nameOf = (provider: ProviderUsageSummary) =>
    NAMES[provider.provider] ?? PROVIDER_LABELS[provider.provider];

  return (
    <Show when={ordered()[0]}>
      {(first) => {
        const top = () => usageOf(first());
        const others = () => ordered().length - 1;
        return (
          <div class="usage-rings">
            <div class="usage-ring-wrap">
              <button
                type="button"
                class={`usage-ring usage-ring-${top().level}`}
                aria-label={ordered()
                  .map(
                    (provider) => `${nameOf(provider)} ${Math.round(usageOf(provider).highest)}%`,
                  )
                  .join(", ")}
                onClick={props.onOpenUsage}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
              >
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" class="usage-ring-track" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    class="usage-ring-value"
                    stroke-dasharray={`${(Math.min(100, top().highest) / 100) * 94.25} 94.25`}
                  />
                </svg>
                <ProviderLogo provider={first().provider} size={15} />
                <Show when={others() > 0}>
                  <span class="usage-ring-more" aria-hidden="true">
                    +{others()}
                  </span>
                </Show>
              </button>
              <Show when={open()}>
                <div class="usage-ring-popover" role="tooltip">
                  <For each={ordered()}>
                    {(provider) => (
                      <div class="usage-ring-provider">
                        <strong>
                          <ProviderLogo provider={provider.provider} size={13} />
                          {nameOf(provider)}
                        </strong>
                        <For each={provider.limits.filter((limit) => limit.usedPercent !== null)}>
                          {(limit) => (
                            <div class="usage-ring-limit">
                              <span>{limit.label}</span>
                              <meter min="0" max="100" value={limit.usedPercent ?? 0} />
                              <b>{Math.round(limit.usedPercent ?? 0)}%</b>
                              <Show when={limit.resetsAt}>
                                {(resetsAt) => <small>{resetsIn(resetsAt())}</small>}
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        );
      }}
    </Show>
  );
}

/** "2h 05m", "6d 14h": time until the limit window resets. */
export function resetsIn(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
