import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  type AgentEvent,
  type AgentModelId,
  type AgentModelOption,
  type AgentReasoningEffort,
  type AgentStatus,
  type ApprovalRequest,
  type OrchestratorRun,
  type OrchestratorVerificationEvidence,
  providerForModel,
  type TaskExecutionStrategy,
} from "../../../shared/ipc";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { PerformanceView } from "./PerformanceView";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { WorkflowExportMenu } from "./WorkflowExportMenu";

const TEAM_MODEL_KEY = "sahkarmi.team.model";
const TEAM_EFFORT_KEY = "sahkarmi.team.effort";

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the choice simply is not remembered.
  }
}

const STATUS_KEYS: Record<string, Parameters<typeof t>[0]> = {
  planning: "teamStatusPlanning",
  running: "teamStatusRunning",
  paused: "teamStatusPaused",
  completed: "teamStatusCompleted",
  failed: "teamStatusFailed",
  pending: "teamStatusPending",
  blocked: "teamStatusBlocked",
  repairing: "teamStatusRepairing",
  idle: "teamStatusIdle",
  waiting: "teamStatusWaiting",
};

/** A status in the owner's words; an unknown one is shown as it is. */
function statusLabel(status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}

function effortLabel(effort: AgentReasoningEffort): string {
  if (effort === "xhigh") return "Extra high";
  return `${effort.slice(0, 1).toUpperCase()}${effort.slice(1)}`;
}

/** Older runs have no verdict: read their pass/fail. */
function verdictOf(evidence: OrchestratorVerificationEvidence) {
  return evidence.verdict ?? (evidence.passed ? "passed" : "failed");
}

function verdictLabel(evidence: OrchestratorVerificationEvidence): string {
  const verdict = verdictOf(evidence);
  return verdict === "passed"
    ? t("engineVerdictPassed")
    : verdict === "failed"
      ? t("engineVerdictFailed")
      : t("engineVerdictUnverified");
}

export function OrchestratorView(props: {
  bots: BotProfile[];
  onOpenCoworker?: (botId: string) => void;
  /** The workspace the team works in; its coworkers and team members are used. */
  workspaceId?: string | null;
  modelOptions?: AgentModelOption[];
  agentStatus?: AgentStatus;
  /** The model the team starts with when the owner has not chosen one. */
  defaultModel?: AgentModelId | null;
  /** A goal typed on Home ("Give it to a team"): it is put in the box, never started by itself. */
  initialObjective?: string;
}) {
  const [runs, setRuns] = createSignal<OrchestratorRun[]>([]);
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(null);
  const [objective, setObjective] = createSignal("");
  createEffect(() => {
    const goal = props.initialObjective?.trim();
    if (goal) setObjective(goal);
  });
  // A team project means the whole team unless the owner picks otherwise.
  const [strategyMode, setStrategyMode] = createSignal<"auto" | TaskExecutionStrategy>(
    "multi-agent",
  );
  const [loading, setLoading] = createSignal(false);
  const [startError, setStartError] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);
  const [approvals, setApprovals] = createSignal<ApprovalRequest[]>([]);
  const loadApprovals = async () => {
    try {
      setApprovals((await window.sahkarmi.approvals?.list?.()) ?? []);
    } catch {
      setApprovals([]);
    }
  };
  /** Team members of a run that are paused on an approval the owner has not decided yet. */
  const waitingMembers = (run: OrchestratorRun) => {
    const ids = new Set(run.instances.map((instance) => instance.botId));
    const seen = new Set<string>();
    return approvals()
      .filter((item) => item.status === "pending" && ids.has(item.botId))
      .filter((item) => {
        if (seen.has(item.botId)) return false;
        seen.add(item.botId);
        return true;
      })
      .map((item) => ({
        botId: item.botId,
        name:
          props.bots.find((bot) => bot.id === item.botId)?.name ??
          run.instances.find((instance) => instance.botId === item.botId)?.botName ??
          item.botId,
        title: item.title,
      }));
  };
  const [teamModel, setTeamModel] = createSignal<AgentModelId | null>(
    (remembered(TEAM_MODEL_KEY) as AgentModelId | null) ?? null,
  );
  const [teamEffort, setTeamEffort] = createSignal<AgentReasoningEffort | null>(
    (remembered(TEAM_EFFORT_KEY) as AgentReasoningEffort | null) ?? null,
  );
  const modelChoices = () => props.modelOptions ?? [];
  /** The model's AI tool is connected on this PC (unknown status counts as ready). */
  const providerReady = (id: AgentModelId) => {
    const providers = props.agentStatus?.providers;
    if (!providers) return true;
    const state = providers.find((status) => status.id === providerForModel(id))?.state;
    // "not-started": installed and signed in, it starts on first use.
    return state === undefined || state === "available" || state === "not-started";
  };
  /** The chosen model when it is still offered, else the app's current one. */
  const chosenModel = createMemo<AgentModelId | null>(() => {
    const picked = teamModel();
    const usable = (id: AgentModelId | null | undefined) =>
      Boolean(id && modelChoices().some((option) => option.id === id) && providerReady(id));
    if (usable(picked)) return picked;
    if (usable(props.defaultModel)) return props.defaultModel ?? null;
    // The app's current model is not set up on this PC: start on one that is.
    return (
      modelChoices().find((option) => providerReady(option.id))?.id ?? modelChoices()[0]?.id ?? null
    );
  });
  const chosenOption = createMemo(() =>
    modelChoices().find((option) => option.id === chosenModel()),
  );
  const effortChoices = createMemo<AgentReasoningEffort[]>(
    () => chosenOption()?.supportedReasoningEfforts ?? [],
  );
  const chosenEffort = createMemo<AgentReasoningEffort | null>(() => {
    const choices = effortChoices();
    const picked = teamEffort();
    if (picked && choices.includes(picked)) return picked;
    const fallback = chosenOption()?.defaultReasoningEffort ?? null;
    return fallback && choices.includes(fallback) ? fallback : (choices[0] ?? null);
  });
  const [checkCommand, setCheckCommand] = createSignal("");
  const [showPerformance, setShowPerformance] = createSignal(false);

  const loadRuns = async () => {
    try {
      if (!window.sahkarmi?.orchestrator) return;
      const list = await window.sahkarmi.orchestrator.getRuns();
      setRuns(list);
      if (list.length > 0 && !selectedRunId()) {
        setSelectedRunId(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load orchestrator runs:", err);
    }
  };

  onMount(() => {
    void loadRuns();
    void loadApprovals();

    const unsubscribe = window.sahkarmi?.agent?.onEvent?.((event: AgentEvent) => {
      if (
        event.type === "orchestrator-run-updated" ||
        event.type === "orchestrator-task-updated" ||
        event.type === "orchestrator-handoff"
      ) {
        void loadRuns();
      }
      if (event.type === "approvals-changed") setApprovals(event.approvals);
    });

    onCleanup(() => {
      if (typeof unsubscribe === "function") unsubscribe();
    });
  });

  const handleStartRun = async (e: Event) => {
    e.preventDefault();
    const text = objective().trim();
    if (!text || loading()) return;

    setLoading(true);
    setStartError(null);
    try {
      const mode = strategyMode();
      const forced: TaskExecutionStrategy | undefined = mode === "auto" ? undefined : mode;
      const newRun = await window.sahkarmi.orchestrator.startRun({
        objective: text,
        forcedStrategy: forced,
        checkCommand: checkCommand().trim() || null,
        workspaceId: props.workspaceId ?? undefined,
        model: chosenModel(),
        reasoningEffort: chosenEffort(),
      });
      setObjective("");
      await loadRuns();
      setSelectedRunId(newRun.id);
    } catch (err) {
      setStartError(t("teamStartFailed", { reason: plainError(err) }));
    } finally {
      setLoading(false);
    }
  };

  /** Pause, Resume and Cancel: a refusal is shown, never lost in the console. */
  const control = async (action: () => Promise<unknown>) => {
    setStartError(null);
    try {
      await action();
    } catch (err) {
      setStartError(plainError(err));
    }
    await loadRuns();
  };
  const handlePause = (runId: string) =>
    control(() => window.sahkarmi.orchestrator.pauseRun(runId));
  const handleResume = (runId: string) =>
    control(() => window.sahkarmi.orchestrator.resumeRun(runId));
  const handleCancel = (runId: string) =>
    control(() => window.sahkarmi.orchestrator.cancelRun(runId));

  const copyReport = async (report: string) => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const currentRun = () => runs().find((r) => r.id === selectedRunId()) ?? runs()[0];

  const getBotForId = (botId: string) => {
    return props.bots.find((b) => b.id === botId);
  };

  const modes: Array<{ id: "auto" | TaskExecutionStrategy; label: string }> = [
    { id: "multi-agent", label: t("orchestratorMultiAgent") },
    { id: "single-agent", label: t("orchestratorFastPath") },
    { id: "auto", label: t("orchModeAuto") },
  ];

  return (
    <div class="orch-view">
      <header class="orch-header">
        <div class="orch-header-row">
          <h1>{t("orchestratorTitle")}</h1>
        </div>
        <p>{t("orchestratorSubtitle")}</p>
        <button
          type="button"
          class="orch-performance-toggle"
          aria-expanded={showPerformance()}
          onClick={() => setShowPerformance((value) => !value)}
        >
          {showPerformance() ? t("performanceHide") : t("performanceShow")}
        </button>
      </header>
      <Show when={showPerformance()}>
        <PerformanceView />
      </Show>

      <form class="orch-form" onSubmit={handleStartRun}>
        <textarea
          class="orch-objective"
          value={objective()}
          onInput={(e) => setObjective(e.currentTarget.value)}
          placeholder={t("orchestratorObjectivePlaceholder")}
          rows={3}
        />
        <details class="orch-advanced">
          <summary>{t("orchAdvanced")}</summary>
          <label class="orch-check">
            <span>{t("engineCheckLabel")}</span>
            <input
              type="text"
              maxLength={500}
              value={checkCommand()}
              onInput={(e) => setCheckCommand(e.currentTarget.value)}
              placeholder={t("engineCheckPlaceholder")}
            />
            <small class="settings-meta">{t("engineCheckHint")}</small>
          </label>
        </details>
        <Show when={props.agentStatus && chosenModel()}>
          {(model) => (
            <div class="orch-team-model">
              <ProviderModelPicker
                variant="field"
                label={t("teamModelLabel")}
                ariaLabel={t("teamModelLabel")}
                value={model()}
                modelOptions={modelChoices()}
                agentStatus={props.agentStatus as AgentStatus}
                onChange={(next) => {
                  setTeamModel(next);
                  remember(TEAM_MODEL_KEY, next);
                }}
              />
              <Show when={effortChoices().length > 1}>
                <label class="composer-effort" title={t("teamEffortHint")}>
                  <span class="composer-effort-label">{t("teamEffortLabel")}</span>
                  <select
                    value={chosenEffort() ?? ""}
                    aria-label={t("teamEffortLabel")}
                    onChange={(event) => {
                      const next = event.currentTarget.value as AgentReasoningEffort;
                      setTeamEffort(next);
                      remember(TEAM_EFFORT_KEY, next);
                    }}
                  >
                    <For each={effortChoices()}>
                      {(effort) => <option value={effort}>{effortLabel(effort)}</option>}
                    </For>
                  </select>
                </label>
              </Show>
              <small class="settings-meta">{t("teamModelHint")}</small>
            </div>
          )}
        </Show>
        <div class="orch-form-row">
          <div class="orch-modes">
            <span>{t("orchModeLabel")}:</span>
            <For each={modes}>
              {(mode) => (
                <button
                  type="button"
                  class="orch-mode"
                  classList={{ "orch-mode-active": strategyMode() === mode.id }}
                  aria-pressed={strategyMode() === mode.id}
                  onClick={() => setStrategyMode(mode.id)}
                >
                  {mode.label}
                </button>
              )}
            </For>
          </div>
          <button
            type="submit"
            class="button-primary orch-launch"
            disabled={loading() || !objective().trim()}
          >
            {loading() ? t("teamStarting") : t("orchestratorStart")}
          </button>
        </div>
        <Show when={startError()}>
          {(message) => (
            <p class="orch-start-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
      </form>

      <Show
        when={runs().length > 0}
        fallback={
          <div class="orch-empty">
            <p>{t("orchestratorNoRuns")}</p>
          </div>
        }
      >
        <div class="orch-layout">
          <div class="orch-runs">
            <h3 class="orch-section-title">{t("teamRunsTitle")}</h3>
            <For each={runs()}>
              {(run) => (
                <button
                  type="button"
                  class="orch-run"
                  classList={{ "orch-run-active": selectedRunId() === run.id }}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div class="orch-run-head">
                    <span
                      class="orch-strategy"
                      classList={{ "orch-strategy-single": run.strategy === "single-agent" }}
                    >
                      {run.strategy === "single-agent"
                        ? t("orchestratorFastPath")
                        : t("orchestratorMultiAgent")}
                    </span>
                    <span class="orch-status" data-status={run.status}>
                      {statusLabel(run.status)}
                    </span>
                  </div>
                  <div class="orch-run-objective">{run.objective}</div>
                </button>
              )}
            </For>
          </div>

          <Show when={currentRun()}>
            {(run) => (
              <div class="orch-detail">
                <div class="orch-detail-top">
                  <div class="orch-detail-title">
                    <div class="orch-detail-meta">
                      <span
                        class="orch-status orch-status-strategy"
                        data-status={run().strategy === "single-agent" ? "single" : "multi"}
                      >
                        {run().strategy === "single-agent"
                          ? t("orchestratorFastPath")
                          : t("orchestratorMultiAgent")}
                      </span>
                      <span class="orch-detail-time">
                        {new Date(run().startedAt).toLocaleTimeString()}
                      </span>
                      <Show when={run().leadName && run().status !== "planning"}>
                        <span class="orch-detail-time">
                          {t("teamLead", { name: run().leadName ?? "" })}
                        </span>
                      </Show>
                      <Show when={run().plannedBy && run().status !== "planning"}>
                        <span class="orch-detail-time">
                          {run().plannedBy === "ceo"
                            ? t("enginePlannedByCeo", { name: run().leadName ?? "CEO" })
                            : t("enginePlannedByTemplate")}
                          {(run().replans ?? 0) > 0
                            ? ` · ${t("engineReplanned", { count: String(run().replans) })}`
                            : ""}
                        </span>
                      </Show>
                    </div>
                    <h2>{run().objective}</h2>
                  </div>

                  <div class="orch-controls">
                    <WorkflowExportMenu
                      options={[
                        { label: "exportButton", source: { kind: "team-run", runId: run().id } },
                      ]}
                    />
                    <Show when={run().status === "running"}>
                      <button type="button" onClick={() => handlePause(run().id)}>
                        {t("teamPause")}
                      </button>
                    </Show>
                    <Show when={run().status === "paused"}>
                      <button
                        type="button"
                        class="orch-resume"
                        onClick={() => handleResume(run().id)}
                      >
                        {t("teamResume")}
                      </button>
                    </Show>
                    <Show
                      when={
                        run().status === "running" ||
                        run().status === "paused" ||
                        run().status === "planning"
                      }
                    >
                      <button
                        type="button"
                        class="orch-cancel"
                        onClick={() => handleCancel(run().id)}
                      >
                        {t("teamCancel")}
                      </button>
                    </Show>
                  </div>
                </div>

                <Show when={run().waitingOn}>
                  {(wait) => (
                    <div class="orch-wait">{t("teamWaiting", { title: wait().title })}</div>
                  )}
                </Show>

                <Show when={run().status === "running" && waitingMembers(run()).length > 0}>
                  <div class="orch-wait" role="status">
                    <strong>{t("teamNeedsYou")}</strong>
                    <For each={waitingMembers(run())}>
                      {(member) => (
                        <div class="orch-wait-row">
                          <span>
                            {member.name}: {member.title}
                          </span>
                          <button
                            type="button"
                            class="button-primary"
                            onClick={() => props.onOpenCoworker?.(member.botId)}
                          >
                            {t("teamOpenToDecide")}
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={run().status === "planning"}>
                  <div class="orch-wait orch-planning" role="status">
                    {t("teamPlanning", { name: run().leadName ?? "The lead" })}
                  </div>
                </Show>

                <Show when={run().status === "failed" && run().error}>
                  <p class="orch-start-error">{run().error}</p>
                </Show>

                <Show
                  when={run().report && (run().status === "completed" || run().status === "failed")}
                >
                  <div class="orch-report">
                    <div class="orch-report-head">
                      <h4 class="orch-section-title">{t("teamReportTitle")}</h4>
                      <button type="button" onClick={() => void copyReport(run().report ?? "")}>
                        {copied() ? t("teamCopied") : t("teamCopyReport")}
                      </button>
                    </div>
                    <div class="orch-report-body">{run().report}</div>
                  </div>
                </Show>

                <Show when={run().status !== "planning"}>
                  <div>
                    <h4 class="orch-section-title">{t("teamMembersTitle")}</h4>
                    <div class="orch-instances">
                      <For each={uniqueMembers(run())}>
                        {(instance) => {
                          const bot = getBotForId(instance.botId);
                          return (
                            <button
                              type="button"
                              class="orch-instance"
                              onClick={() => props.onOpenCoworker?.(instance.botId)}
                            >
                              <Show when={bot}>
                                {(b) => (
                                  <AgentAvatar shape={b().avatarShape} color={b().avatarColor} />
                                )}
                              </Show>
                              <div>
                                <div class="orch-instance-name">
                                  {bot?.name ?? instance.botName}
                                </div>
                                <div class="orch-instance-role">
                                  {bot?.role ?? instance.role} · {statusLabel(instance.status)}
                                </div>
                              </div>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>

                  <div>
                    <h4 class="orch-section-title">{t("teamStepsTitle")}</h4>
                    <div class="orch-tasks">
                      <For each={run().tasks}>
                        {(task, idx) => {
                          const bot = getBotForId(task.assignedBotId);
                          return (
                            <div class="orch-task" data-status={task.status}>
                              <div class="orch-task-head">
                                <div class="orch-task-title">
                                  <span>
                                    #{idx() + 1} {task.title}
                                  </span>
                                  <Show when={bot}>
                                    {(b) => <span class="orch-task-bot">({b().name})</span>}
                                  </Show>
                                </div>
                                <span class="orch-status" data-status={task.status}>
                                  {statusLabel(task.status)}
                                </span>
                                <Show when={task.status === "completed" && task.verification}>
                                  {(verification) => (
                                    <span
                                      class="orch-verdict"
                                      data-verdict={verification()}
                                      title={
                                        verification() === "unverified"
                                          ? t("engineUnverifiedHint")
                                          : undefined
                                      }
                                    >
                                      {verification() === "verified"
                                        ? t("engineVerdictPassed")
                                        : t("engineVerdictUnverified")}
                                    </span>
                                  )}
                                </Show>
                              </div>

                              <p>{task.description}</p>
                              <Show when={typeof task.inputs.result === "string"}>
                                <details class="orch-task-result">
                                  <summary>{t("teamResult")}</summary>
                                  <p>{String(task.inputs.result)}</p>
                                </details>
                              </Show>
                              <Show when={task.error && task.status === "failed"}>
                                <p class="orch-task-error">{task.error}</p>
                              </Show>

                              <Show when={task.evidence.length > 0}>
                                <div class="orch-evidence">
                                  <For each={task.evidence}>
                                    {(ev) => (
                                      <span
                                        data-passed={ev.passed ? "true" : "false"}
                                        data-verdict={verdictOf(ev)}
                                        title={ev.summary}
                                      >
                                        {ev.type}: {verdictLabel(ev)}
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={run().messages.length > 0}>
                  <div>
                    <h4 class="orch-section-title">{t("teamLogTitle")}</h4>
                    <div class="orch-log">
                      <For each={run().messages}>
                        {(msg) => (
                          <div class="orch-msg">
                            <div>
                              <span class="orch-msg-type">[{msg.type}]</span>{" "}
                              <span>{msg.summary}</span>
                            </div>
                            <span class="orch-msg-time">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** One card per coworker, even when one member does several steps. */
function uniqueMembers(run: OrchestratorRun): OrchestratorRun["instances"] {
  return run.instances.filter(
    (instance, index, all) => all.findIndex((other) => other.botId === instance.botId) === index,
  );
}

/** The reason without Electron's "Error invoking remote method" wrapper. */
function plainError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
