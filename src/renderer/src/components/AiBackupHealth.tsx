import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  type AgentProviderId,
  type AgentProviderStatus,
  type AgentStatus,
  providerForModel,
  type UsageOverview,
} from "../../../shared/ipc";
import { PROVIDER_CATALOG, providerCatalogEntry } from "../../../shared/provider-catalog";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { ProviderLogo } from "./ProviderLogo";

/** A share of the plan limit from which an account is shown as "may run out soon". */
const NEAR_LIMIT_PERCENT = 80;

function nameOf(id: AgentProviderId): string {
  return providerCatalogEntry(id)?.name ?? id;
}

function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    [],
    sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { weekday: "short", hour: "numeric", minute: "2-digit" },
  );
}

/** Connected AIs in the order Sahkarmi suggests: paid plans first, free ones last. */
export function suggestedBackupOrder(providers: AgentProviderStatus[]): AgentProviderId[] {
  const connected = PROVIDER_CATALOG.filter(
    (entry) => providers.find((provider) => provider.id === entry.id)?.state === "available",
  );
  return [
    ...connected.filter((entry) => !entry.free),
    ...connected.filter((entry) => entry.free && entry.id !== "opencode"),
    ...connected.filter((entry) => entry.id === "opencode"),
  ].map((entry) => entry.id);
}

/** The owner's backup order, shared by the two cards so one follows what the other saves. */
const [order, setOrder] = createSignal<AgentProviderId[] | null>(null);

function useBackupOrder() {
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let savedTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    void window.sahkarmi?.orchestrator
      ?.getEngineSettings?.()
      .then((settings) => setOrder(settings.backupOrder ?? []))
      .catch(() => setOrder([]));
    onCleanup(() => clearTimeout(savedTimer));
  });

  async function save(next: AgentProviderId[]) {
    const before = order();
    setOrder(next);
    try {
      const settings = await window.sahkarmi.orchestrator.setEngineSettings({ backupOrder: next });
      setOrder(settings.backupOrder ?? []);
      setError(null);
      setSaved(true);
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => setSaved(false), 1_500);
    } catch (cause) {
      setOrder(before);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return { order, saved, error, save };
}

/**
 * Settings > AI and models: the order in which AIs take over when one runs out of its limit.
 * The owner sets it once; the same job then carries on with the next AI by itself.
 */
export function BackupOrder(props: { agentStatus: AgentStatus }) {
  const { order, saved, error, save } = useBackupOrder();
  const providers = () => props.agentStatus.providers ?? [];
  const status = (id: AgentProviderId) => providers().find((provider) => provider.id === id);
  const suggested = createMemo(() => suggestedBackupOrder(providers()));
  const addable = createMemo(() => suggested().filter((id) => !(order() ?? []).includes(id)));

  function move(index: number, by: -1 | 1) {
    const next = [...(order() ?? [])];
    const target = index + by;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void save(next);
  }

  const stateLine = (id: AgentProviderId) => {
    const current = status(id);
    if (current?.state !== "available") return t("backupNotConnected");
    if (current.limitedUntil) return t("backupLimited", { time: clock(current.limitedUntil) });
    return t("backupReady");
  };

  return (
    <section class="settings-card backup-card" id="backup-order" aria-label={t("backupTitle")}>
      <h2>{t("backupTitle")}</h2>
      <p>{t("backupIntro")}</p>
      <Show when={order()}>
        {(current) => (
          <>
            <Show
              when={current().length > 0}
              fallback={
                <div class="backup-empty">
                  <p class="settings-meta">{t("backupOff")}</p>
                  <Show
                    when={suggested().length >= 2}
                    fallback={<p class="settings-meta">{t("backupNeedTwo")}</p>}
                  >
                    <p class="backup-suggestion">
                      {t("backupSuggestedWhy", { order: suggested().map(nameOf).join(" → ") })}
                    </p>
                    <button
                      type="button"
                      class="button-primary"
                      onClick={() => void save(suggested())}
                    >
                      {t("backupUseSuggested")}
                    </button>
                  </Show>
                </div>
              }
            >
              <ol class="backup-list" aria-label={t("backupOrderNow")}>
                <For each={current()}>
                  {(id, index) => (
                    <li
                      class="backup-row"
                      classList={{ "backup-row-off": status(id)?.state !== "available" }}
                    >
                      <span class="backup-step" aria-hidden="true">
                        {index() + 1}
                      </span>
                      <ProviderLogo provider={id} size={20} tile />
                      <span class="backup-row-text">
                        <strong>{nameOf(id)}</strong>
                        <small>
                          {index() === 0 ? t("backupFirst") : t("backupThen")} · {stateLine(id)}
                        </small>
                      </span>
                      <span class="backup-row-actions">
                        <button
                          type="button"
                          class="icon-step"
                          disabled={index() === 0}
                          aria-label={t("backupMoveUp", { name: nameOf(id) })}
                          title={t("backupMoveUp", { name: nameOf(id) })}
                          onClick={() => move(index(), -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          class="icon-step"
                          disabled={index() === current().length - 1}
                          aria-label={t("backupMoveDown", { name: nameOf(id) })}
                          title={t("backupMoveDown", { name: nameOf(id) })}
                          onClick={() => move(index(), 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          class="icon-step"
                          aria-label={t("backupRemove", { name: nameOf(id) })}
                          title={t("backupRemove", { name: nameOf(id) })}
                          onClick={() => void save(current().filter((item) => item !== id))}
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  )}
                </For>
              </ol>
              <Show when={addable().length > 0}>
                <div class="backup-add">
                  <span class="settings-meta">{t("backupAddLabel")}</span>
                  <For each={addable()}>
                    {(id) => (
                      <button
                        type="button"
                        class="chip-button"
                        onClick={() => void save([...current(), id])}
                      >
                        + {nameOf(id)}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <button type="button" class="link-button" onClick={() => void save([])}>
                {t("backupTurnOff")}
              </button>
            </Show>
            <Show when={saved()}>
              <span class="backup-saved" role="status">
                {t("backupSaved")}
              </span>
            </Show>
            <Show when={error()}>
              <p class="center-view-error" role="alert">
                {error()}
              </p>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}

type HealthKind = "ready" | "near" | "limited" | "signed-out" | "not-set-up" | "problem";

interface HealthRow {
  id: AgentProviderId;
  kind: HealthKind;
  title: string;
  body: string;
  usedBy: number;
}

/**
 * Settings > AI and models: each AI the owner uses in one plain line, with a Fix button when
 * something needs them (signed out, limit used up with no backup, not working).
 */
export function AccountHealth(props: {
  agentStatus: AgentStatus;
  bots: BotProfile[];
  onShowBackup: () => void;
}) {
  const [usage, setUsage] = createSignal<UsageOverview | null>(null);
  const [busy, setBusy] = createSignal<AgentProviderId | null>(null);

  onMount(() => {
    void window.sahkarmi?.usage
      ?.overview?.()
      .then(setUsage)
      .catch(() => undefined);
    if (order() === null) {
      void window.sahkarmi?.orchestrator
        ?.getEngineSettings?.()
        .then((settings) => setOrder(settings.backupOrder ?? []))
        .catch(() => undefined);
    }
  });

  const providers = () => props.agentStatus.providers ?? [];

  const rows = createMemo<HealthRow[]>(() => {
    const usedBy = new Map<AgentProviderId, number>();
    for (const bot of props.bots) {
      const provider = providerForModel(bot.model);
      usedBy.set(provider, (usedBy.get(provider) ?? 0) + 1);
    }
    const isReady = (id: AgentProviderId) =>
      providers().some(
        (provider) =>
          provider.id === id && provider.state === "available" && !provider.limitedUntil,
      );
    const nextFor = (id: AgentProviderId) => {
      const list = order() ?? [];
      const at = list.indexOf(id);
      const rotated = at === -1 ? list : [...list.slice(at + 1), ...list.slice(0, at)];
      const backup = rotated.find((candidate) => candidate !== id && isReady(candidate));
      return backup ? t("healthNextBackup", { name: nameOf(backup) }) : t("healthNextNone");
    };
    const result: HealthRow[] = [];
    for (const entry of PROVIDER_CATALOG) {
      const current = providers().find((provider) => provider.id === entry.id);
      const count = usedBy.get(entry.id) ?? 0;
      if (!current) continue;
      const connected = current.state === "available";
      // Only AIs the owner actually uses: connected, or a coworker is set to it.
      if (!connected && count === 0) continue;
      const windows = usage()?.providers.find((item) => item.provider === entry.id)?.limits ?? [];
      const worst = windows
        .filter((window) => typeof window.usedPercent === "number")
        .sort((left, right) => (right.usedPercent ?? 0) - (left.usedPercent ?? 0))[0];
      const percent = worst?.usedPercent ?? null;
      const limitedUntil =
        current.limitedUntil ?? (percent !== null && percent >= 100 ? worst?.resetsAt : null);
      let kind: HealthKind = "ready";
      let title = t("healthReady");
      let body = t("healthReadyBody", { account: current.email ? ` (${current.email})` : "" });
      if (current.state === "sign-in-required") {
        kind = "signed-out";
        title = t("healthSignedOut");
        body = t("healthSignedOutBody", { name: entry.name });
      } else if (!connected) {
        if (current.state === "checking" || current.state === "not-started") continue;
        kind = current.state === "not-installed" ? "not-set-up" : "problem";
        title = t(kind === "not-set-up" ? "healthNotSetUp" : "healthProblem");
        body =
          kind === "not-set-up"
            ? t("healthNotSetUpBody", { name: entry.name })
            : (current.message ?? "");
      } else if (limitedUntil || (percent !== null && percent >= 100)) {
        kind = "limited";
        title = t("healthLimited");
        body = t("healthLimitedBody", { time: clock(limitedUntil), next: nextFor(entry.id) });
      } else if (percent !== null && percent >= NEAR_LIMIT_PERCENT) {
        kind = "near";
        title = t("healthNearLimit", { percent: String(Math.round(percent)) });
        body = t("healthNearLimitBody", { next: nextFor(entry.id) });
      }
      result.push({ id: entry.id, kind, title, body, usedBy: count });
    }
    return result;
  });

  const needsBackup = (row: HealthRow) =>
    (row.kind === "limited" || row.kind === "near") && (order() ?? []).length === 0;

  async function fix(row: HealthRow) {
    if (row.kind === "limited" || row.kind === "near") {
      props.onShowBackup();
      return;
    }
    setBusy(row.id);
    try {
      if (row.kind === "signed-out" || row.kind === "not-set-up") {
        await window.sahkarmi.providerSetup.connect(row.id);
      } else {
        await window.sahkarmi.providerSetup.check(row.id);
      }
    } catch {
      // The AI's own row below shows what went wrong.
    } finally {
      setBusy(null);
    }
  }

  const fixLabel = (row: HealthRow) =>
    row.kind === "signed-out"
      ? t("healthFixSignIn")
      : row.kind === "not-set-up"
        ? t("healthFixSetUp")
        : row.kind === "problem"
          ? t("healthFixCheck")
          : t("healthFixBackup");

  return (
    <Show when={rows().length > 0}>
      <section class="settings-card health-card" aria-label={t("healthTitle")}>
        <h2>{t("healthTitle")}</h2>
        <p>{rows().every((row) => row.kind === "ready") ? t("healthAllGood") : t("healthIntro")}</p>
        <ul class="health-list">
          <For each={rows()}>
            {(row) => (
              <li class={`health-row health-${row.kind}`}>
                <ProviderLogo provider={row.id} size={20} tile />
                <div class="health-row-text">
                  <span class="health-row-name">
                    <strong>{nameOf(row.id)}</strong>
                    <span class={`health-pill health-pill-${row.kind}`}>{row.title}</span>
                  </span>
                  <small>
                    {row.body}
                    <Show when={row.usedBy > 0}>
                      {" "}
                      {row.usedBy === 1
                        ? t("healthUsedByOne")
                        : t("healthUsedBy", { count: String(row.usedBy) })}
                    </Show>
                  </small>
                </div>
                <Show
                  when={
                    row.kind === "signed-out" ||
                    row.kind === "not-set-up" ||
                    row.kind === "problem" ||
                    needsBackup(row)
                  }
                >
                  <button
                    type="button"
                    class="button-primary health-fix"
                    disabled={busy() === row.id}
                    aria-label={`${t("healthFix")}: ${fixLabel(row)} (${nameOf(row.id)})`}
                    onClick={() => void fix(row)}
                  >
                    {fixLabel(row)}
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
