import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type {
  ApprovalCategory,
  ApprovalProvenance,
  ApprovalRequest,
  PermissionPolicyState,
} from "../../../shared/ipc";
import type { BotProfile } from "../data";
import { type MessageKey, t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";

const CATEGORY_LABELS: Record<ApprovalCategory, MessageKey> = {
  payment: "categoryPayment",
  message: "categoryMessage",
  submission: "categorySubmission",
  data: "categoryData",
  other: "categoryOther",
};

interface ApprovalsViewProps {
  approvals: ApprovalRequest[];
  bots: BotProfile[];
  onDecide: (approvalId: string, decision: "approved" | "rejected", note: string) => Promise<void>;
  onOpenCoworker: (botId: string) => void;
}

/** "Where this request came from", in the owner's language. Labels are shown as plain text. */
export function provenanceText(provenance: ApprovalProvenance | undefined): string | null {
  if (!provenance) return null;
  const name = provenance.label ?? "";
  switch (provenance.kind) {
    case "owner":
      return t("provenanceOwner");
    case "remote":
      return t("provenanceRemote");
    case "routine":
      return t("provenanceRoutine");
    case "schedule":
      return t("provenanceSchedule");
    case "team-run":
      return t("provenanceTeamRun");
    case "coworker":
      return name ? t("provenanceCoworkerNamed", { name }) : t("provenanceCoworker");
    case "system":
      return t("provenanceSystem");
    case "web":
      return t("provenanceWeb", { name: name || "?" });
    case "app":
      return t("provenanceApp", { name: name || "?" });
    case "file":
      return t("provenanceFile", { name: name || "?" });
    default:
      return null;
  }
}

/**
 * "How much should Sahkarmi ask you?": two plain choices at the top of Approvals. Every other
 * permission setting stays where it was, in Settings > Permissions.
 */
function AskLevel() {
  const [policy, setPolicy] = createSignal<PermissionPolicyState | null>(null);
  const [error, setError] = createSignal("");
  onMount(() => {
    void window.sahkarmi?.permissions
      ?.get?.()
      .then(setPolicy)
      .catch(() => undefined);
  });
  async function choose(askLess: boolean) {
    const api = window.sahkarmi?.permissions;
    if (!api?.setAskLess) return;
    try {
      setPolicy(await api.setAskLess(askLess));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <Show when={window.sahkarmi?.permissions?.setAskLess && policy()}>
      {(current) => (
        <section class="ask-level" aria-label={t("askLevelTitle")}>
          <strong>{t("askLevelTitle")}</strong>
          <Show
            when={!current().autoMode}
            fallback={<p class="ask-level-note">{t("askLevelAuto")}</p>}
          >
            <div class="ask-level-choices">
              <button
                type="button"
                class="ask-level-choice"
                classList={{ "ask-level-on": !current().askLess }}
                aria-pressed={!current().askLess}
                onClick={() => void choose(false)}
              >
                <span>{t("askEach")}</span>
                <small>{t("askEachHint")}</small>
              </button>
              <button
                type="button"
                class="ask-level-choice"
                classList={{ "ask-level-on": current().askLess === true }}
                aria-pressed={current().askLess === true}
                onClick={() => void choose(true)}
              >
                <span>{t("askLess")}</span>
                <small>{t("askLessHint")}</small>
              </button>
            </div>
            <p class="ask-level-note">{t("askLevelMore")}</p>
          </Show>
          <Show when={error()}>
            <p class="approval-error" role="alert">
              {error()}
            </p>
          </Show>
        </section>
      )}
    </Show>
  );
}

export function ApprovalsView(props: ApprovalsViewProps) {
  const pending = createMemo(() =>
    props.approvals.filter((approval) => approval.status === "pending"),
  );
  const decided = createMemo(() =>
    props.approvals.filter((approval) => approval.status !== "pending"),
  );
  return (
    <section class="center-view approvals-view" aria-labelledby="approvals-heading">
      <header class="center-view-header window-drag">
        <h1 id="approvals-heading">{t("approvals")}</h1>
        <Show when={pending().length > 0}>
          <span class="center-view-badge center-view-badge-alert" data-count={pending().length}>
            {pending().length}
          </span>
        </Show>
      </header>
      <div class="center-view-body">
        <AskLevel />
        <h2 class="center-view-subheading">{t("pending")}</h2>
        <Show
          when={pending().length > 0}
          fallback={<p class="center-view-empty">{t("approvalsEmpty")}</p>}
        >
          <ul class="approval-list">
            <For each={pending()}>
              {(approval) => (
                <ApprovalCard
                  approval={approval}
                  bot={props.bots.find((bot) => bot.id === approval.botId)}
                  onDecide={props.onDecide}
                  onOpenCoworker={props.onOpenCoworker}
                />
              )}
            </For>
          </ul>
        </Show>
        <Show when={decided().length > 0}>
          <h2 class="center-view-subheading">{t("history")}</h2>
          <ul class="approval-list approval-history">
            <For each={decided()}>
              {(approval) => (
                <ApprovalCard
                  approval={approval}
                  bot={props.bots.find((bot) => bot.id === approval.botId)}
                  onDecide={props.onDecide}
                  onOpenCoworker={props.onOpenCoworker}
                />
              )}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  );
}

export function ApprovalCard(props: {
  approval: ApprovalRequest;
  bot: BotProfile | undefined;
  onDecide: ApprovalsViewProps["onDecide"];
  onOpenCoworker: (botId: string) => void;
  /** In the chat: take focus when nothing else has it, so Enter approves and Esc rejects. */
  inline?: boolean;
}) {
  const [note, setNote] = createSignal("");
  let approveButton: HTMLButtonElement | undefined;
  onMount(() => {
    if (!props.inline || !pending()) return;
    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      (active.isContentEditable ||
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement) &&
      (active.textContent?.trim() || (active as HTMLInputElement).value?.trim());
    if (!typing) approveButton?.focus({ preventScroll: true });
  });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const pending = () => props.approval.status === "pending";

  async function decide(decision: "approved" | "rejected") {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onDecide(props.approval.id, decision, note());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      class={`approval-card approval-card-${props.approval.status}`}
      classList={{ "approval-risk-high": isHighRisk(props.approval) }}
      onKeyDown={(event) => {
        if (!props.inline || !pending() || event.defaultPrevented) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          void decide("rejected");
        } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          // Typing a note and pressing Enter approves with it.
          event.preventDefault();
          void decide("approved");
        }
      }}
    >
      <div class="approval-card-head">
        <button
          type="button"
          class="approval-coworker"
          onClick={() => props.onOpenCoworker(props.approval.botId)}
          disabled={!props.bot}
        >
          <AgentAvatar bot={props.bot} />
          <span>
            <strong>{props.bot?.name ?? props.approval.botId}</strong>
            <small>{props.bot?.role}</small>
          </span>
        </button>
        <Show when={props.approval.category !== "other"}>
          <span class={`approval-category approval-category-${props.approval.category}`}>
            {t(CATEGORY_LABELS[props.approval.category])}
          </span>
        </Show>
        <Show when={props.approval.kind === "permission" && pending()}>
          <span class="approval-kind" title={t("approvalPausedHint")}>
            {t("approvalPaused")}
          </span>
        </Show>
        <time datetime={props.approval.createdAt}>{formatWhen(props.approval.createdAt)}</time>
      </div>
      <h3>
        {props.approval.title}
        <Show when={props.approval.amount}>
          <span class="approval-amount">{props.approval.amount}</span>
        </Show>
      </h3>
      <Show when={props.approval.details}>
        <div class="approval-details">
          <For each={detailLines(props.approval.details)}>
            {(line) => (
              <p>
                <Show when={line.label}>
                  <strong>{line.label}</strong>{" "}
                </Show>
                {line.text}
              </p>
            )}
          </For>
        </div>
      </Show>
      <Show when={provenanceText(props.approval.provenance)}>
        {(text) => (
          <p class="approval-provenance">
            <span>{t("provenanceLabel")}</span> {text()}
          </p>
        )}
      </Show>
      <Show when={pending() && props.approval.routedToBotId}>
        <p class="approval-routed">{t("approvalRouted")}</p>
      </Show>
      <Show when={props.approval.technical}>
        {(technical) => (
          <details class="approval-technical">
            <summary>{t("approvalTechnical")}</summary>
            <pre>{technical()}</pre>
          </details>
        )}
      </Show>
      <Show
        when={pending()}
        fallback={
          <p class="approval-outcome">
            <span class={`approval-outcome-pill approval-outcome-${props.approval.status}`}>
              {props.approval.status === "approved"
                ? t("approved")
                : props.approval.status === "expired"
                  ? t("expired")
                  : t("rejected")}
            </span>
            <Show when={props.approval.decidedBy?.startsWith("coworker:")}>
              <span>{t("approvalDecidedByCoworker")}</span>
            </Show>
            <Show when={props.approval.note}>{(value) => <span>“{value()}”</span>}</Show>
          </p>
        }
      >
        <label class="approval-note">
          <span class="sr-only">{t("addNote")}</span>
          <input
            value={note()}
            placeholder={t("addNote")}
            onInput={(event) => setNote(event.currentTarget.value)}
          />
        </label>
        <div class="approval-actions">
          <button
            type="button"
            class="approval-no"
            disabled={busy()}
            onClick={() => void decide("rejected")}
          >
            {t("approveDont")}
          </button>
          <button
            ref={approveButton}
            type="button"
            class="button-primary approval-yes"
            disabled={busy()}
            onClick={() => void decide("approved")}
          >
            {t("approveOnce")}
          </button>
        </div>
        <p class="approval-once-hint">{t("approvalOnceHint")}</p>
        <Show when={props.inline}>
          <p class="approval-keys">{t("approvalKeys")}</p>
        </Show>
        <Show when={error()}>
          <p class="approval-error" role="alert">
            {error()}
          </p>
        </Show>
      </Show>
    </li>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

const HIGH_RISK_PERMISSIONS = new Set([
  "file_delete",
  "external_messages",
  "publication",
  "business_actions",
  "payments",
  "account_settings",
  "official_forms",
]);

/** Money, outside messages, publishing and deleting get a red edge so they never look routine. */
function isHighRisk(approval: ApprovalRequest): boolean {
  if (approval.kind === "permission") {
    return HIGH_RISK_PERMISSIONS.has(approval.permissionCategory ?? "");
  }
  return ["payment", "message", "submission"].includes(approval.category);
}

/**
 * The plain card text, one line each, with its short label ("Why:", "Is this normal?") in bold
 * so an owner can scan it instead of reading a block.
 */
export function detailLines(details: string): Array<{ label: string | null; text: string }> {
  return details
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([^:?.]{2,28}[:?])\s+(.+)$/u.exec(line);
      return match
        ? { label: match[1] ?? null, text: match[2] ?? "" }
        : { label: null, text: line };
    });
}
