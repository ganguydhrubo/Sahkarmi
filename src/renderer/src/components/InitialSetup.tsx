import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type {
  AgentProviderId,
  AgentProviderState,
  AgentStatus,
  AppSetupState,
  DesktopPlatform,
  MacPermissionId,
  MacPermissionsState,
} from "../../../shared/ipc";
import { ACP_AGENT_PROVIDERS, PROVIDER_LABELS } from "../../../shared/ipc";
import { LANGUAGE_OPTIONS, t } from "../i18n";
import { hasChosenLanguage, language, setLanguage, setTrade, trade } from "../preferences";
import { localiseStarterTeam } from "../starter-names";
import { TRADES, tradeName } from "../trade-names";
import { LanguageWheel } from "./LanguageWheel";
import { ProviderPicker, type ProviderPickerOption } from "./ProviderPicker";

interface InitialSetupProps {
  reviewing?: boolean;
  state: AppSetupState;
  agentStatus: AgentStatus;
  platform: DesktopPlatform;
  onSave: (provider: AgentProviderId) => Promise<void>;
  onClose?: () => void;
}

// OpenCode is bundled with Sahkarmi and has free models, so it is listed first.
const PROVIDERS: Array<{
  id: AgentProviderId;
  name: string;
}> = [
  { id: "opencode", name: "OpenCode (free, built in)" },
  { id: "claude", name: "Claude" },
  { id: "codex", name: "ChatGPT (Codex)" },
  { id: "antigravity", name: "Gemini (Google Antigravity)" },
];

const PERMISSIONS: Array<{
  id: MacPermissionId;
  title: string;
  description: string;
}> = [
  {
    id: "screen-recording",
    title: "Screen Recording",
    description: "Let Computer Use see what is on your screen.",
  },
  {
    id: "accessibility",
    title: "Accessibility",
    description: "Let Computer Use control apps on your Mac.",
  },
];

const EMPTY_PERMISSIONS: MacPermissionsState = {
  screenRecording: "unknown",
  accessibility: "unknown",
};

export function InitialSetup(props: InitialSetupProps) {
  const [selectedProvider, setSelectedProvider] = createSignal<AgentProviderId | null>(
    props.state.preferredProvider,
  );
  const [permissions, setPermissions] = createSignal(EMPTY_PERMISSIONS);
  const [saving, setSaving] = createSignal(false);
  const [permissionBusy, setPermissionBusy] = createSignal<MacPermissionId | null>(null);
  const [error, setError] = createSignal("");
  // A new owner first picks a language on its own screen, then answers the other questions.
  const [pickingLanguage, setPickingLanguage] = createSignal(
    !props.reviewing && !hasChosenLanguage(),
  );
  const languageLabel = () =>
    LANGUAGE_OPTIONS.find((option) => option.code === language())?.label ?? "English";
  const providerOptions = createMemo<ProviderPickerOption[]>(() =>
    [
      ...PROVIDERS,
      // Other agents show up here once they are installed on this computer.
      ...ACP_AGENT_PROVIDERS.filter((id) => {
        const state = props.agentStatus.providers?.find((candidate) => candidate.id === id)?.state;
        return state === "available" || state === "sign-in-required";
      }).map((id) => ({ id, name: PROVIDER_LABELS[id] })),
    ].map((provider) => {
      const status = props.agentStatus.providers?.find((candidate) => candidate.id === provider.id);
      return {
        ...provider,
        state: status?.state ?? fallbackProviderState(props.agentStatus),
        message: status?.message,
        email: status?.email,
      };
    }),
  );
  const availableProviders = createMemo(() =>
    providerOptions().filter((provider) => provider.state === "available"),
  );

  createEffect(() => {
    const options = providerOptions();
    const available = availableProviders();
    const selected = selectedProvider();
    if (selected && options.some((provider) => provider.id === selected)) return;
    const preferred = options.find((provider) => provider.id === props.state.preferredProvider);
    setSelectedProvider(preferred?.id ?? available[0]?.id ?? null);
  });

  async function refreshPermissions(): Promise<void> {
    if (props.platform !== "darwin") return;
    try {
      setPermissions(await window.sahkarmi.getMacPermissions());
    } catch (cause) {
      setError(errorMessage(cause, "Sahkarmi could not read macOS permissions."));
    }
  }

  onMount(() => {
    // Setup lists every AI, so check the ones not started with the app.
    void window.sahkarmi.agent?.probeProviders?.().catch(() => undefined);
    void refreshPermissions();
    const handleFocus = () => void refreshPermissions();
    window.addEventListener("focus", handleFocus);
    onCleanup(() => window.removeEventListener("focus", handleFocus));
  });

  async function requestPermission(permission: MacPermissionId): Promise<void> {
    if (permissionBusy()) return;
    setPermissionBusy(permission);
    setError("");
    try {
      setPermissions(await window.sahkarmi.requestMacPermission(permission));
    } catch (cause) {
      setError(errorMessage(cause, "Sahkarmi could not open this macOS permission."));
    } finally {
      setPermissionBusy(null);
    }
  }

  async function save(): Promise<void> {
    const provider = selectedProvider();
    if (!provider || saving()) return;
    setSaving(true);
    setError("");
    try {
      await props.onSave(provider);
    } catch (cause) {
      setError(errorMessage(cause, "Sahkarmi could not save your provider."));
      setSaving(false);
    }
  }

  return (
    <main class="initial-setup-screen">
      <Show when={pickingLanguage()}>
        <LanguageWheel
          value={language()}
          onChange={setLanguage}
          onContinue={() => {
            setPickingLanguage(false);
            void localiseStarterTeam(language());
          }}
        />
      </Show>
      <Show when={!pickingLanguage()}>
        <section
          class="initial-setup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="initial-setup-title"
          aria-describedby="initial-setup-description"
        >
          <header class="initial-setup-header">
            <p class="initial-setup-eyebrow">
              {props.reviewing ? "Sahkarmi setup" : t("startEyebrow")}
            </p>
            <h1 id="initial-setup-title">
              {props.reviewing ? "Providers & permissions" : t("startTitle")}
            </h1>
            <p id="initial-setup-description" class="initial-setup-intro">
              {props.reviewing
                ? "Choose the default provider for new agents and review macOS permissions."
                : t("startIntro")}
            </p>
          </header>

          <Show when={!props.reviewing}>
            <fieldset class="start-question">
              <legend>{t("startLanguage")}</legend>
              <div class="start-language-chosen">
                <span lang={language()}>{languageLabel()}</span>
                <button
                  type="button"
                  class="start-language-change"
                  onClick={() => setPickingLanguage(true)}
                >
                  {t("startLanguageChange")}
                </button>
              </div>
            </fieldset>
            <fieldset class="start-question">
              <legend>{t("startTrade")}</legend>
              <p class="start-hint">{t("startTradeHint")}</p>
              <div class="start-choices start-choices-trade">
                <For each={TRADES}>
                  {(id) => (
                    <button
                      type="button"
                      class="start-choice"
                      classList={{ "start-choice-on": trade() === id }}
                      aria-pressed={trade() === id}
                      onClick={() => setTrade(id)}
                    >
                      {tradeName(id, language())}
                    </button>
                  )}
                </For>
              </div>
            </fieldset>
            <div class="start-question start-question-ai">
              <h2>{t("startAi")}</h2>
              <p class="start-hint">{t("startAiHint")}</p>
            </div>
          </Show>

          <ProviderPicker
            value={selectedProvider()}
            options={providerOptions()}
            ariaLabel={props.reviewing ? "Default provider" : t("startAiLabel")}
            label={props.reviewing ? "Default provider" : t("startAiLabel")}
            hint={
              props.reviewing ? "Used for new agents. You can change it for each agent later." : ""
            }
            disabled={saving()}
            allowUnavailableSelection
            focusFirst
            onChange={setSelectedProvider}
          />

          <Show when={props.platform === "darwin"}>
            <section class="mac-permissions" aria-labelledby="mac-permissions-title">
              <div class="mac-permissions-heading">
                <div>
                  <h2 id="mac-permissions-title">Mac permissions</h2>
                  <p>Optional. Computer Use needs both permissions.</p>
                </div>
              </div>
              <div class="mac-permission-list">
                <For each={PERMISSIONS}>
                  {(permission) => {
                    const state = () => permissionState(permissions(), permission.id);
                    return (
                      <div class="mac-permission-row">
                        <span class="mac-permission-copy">
                          <strong>{permission.title}</strong>
                          <small>{permission.description}</small>
                        </span>
                        <button
                          type="button"
                          class="mac-permission-action"
                          classList={{ "mac-permission-allowed": state() === "granted" }}
                          disabled={
                            permissionBusy() !== null ||
                            state() === "granted" ||
                            state() === "restricted"
                          }
                          onClick={() => void requestPermission(permission.id)}
                        >
                          {permissionBusy() === permission.id
                            ? "Checking…"
                            : permissionLabel(state())}
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>

          <Show when={error()}>
            <p class="initial-setup-error" role="alert">
              {error()}
            </p>
          </Show>

          <div class="initial-setup-actions">
            <Show when={props.reviewing}>
              <button type="button" class="initial-setup-secondary" onClick={props.onClose}>
                Cancel
              </button>
            </Show>
            <button
              type="button"
              class="initial-setup-save"
              disabled={saving() || !selectedProvider()}
              onClick={() => void save()}
            >
              {saving()
                ? props.reviewing
                  ? "Saving…"
                  : t("startSaving")
                : props.reviewing
                  ? "Save changes"
                  : selectedProvider()
                    ? t("startContinue", { name: providerName(selectedProvider()) })
                    : t("startChoose")}
            </button>
          </div>
        </section>
      </Show>
    </main>
  );
}

function permissionState(
  permissions: MacPermissionsState,
  permission: MacPermissionId,
): MacPermissionsState["screenRecording"] {
  return permission === "screen-recording"
    ? permissions.screenRecording
    : permissions.accessibility;
}

function permissionLabel(state: MacPermissionsState["screenRecording"]): string {
  if (state === "granted") return "Allowed";
  if (state === "denied" || state === "unknown") return "Open Settings";
  if (state === "restricted") return "Restricted";
  return "Allow";
}

function providerName(provider: AgentProviderId | null): string {
  return provider ? PROVIDER_LABELS[provider] : "your AI provider";
}

function fallbackProviderState(status: AgentStatus): AgentProviderState {
  return status.phase === "starting" || status.phase === "restarting" ? "checking" : "error";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
