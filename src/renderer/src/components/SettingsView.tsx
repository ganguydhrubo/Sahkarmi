import { createSignal, For, type JSX, Show } from "solid-js";
import type {
  AgentModelId,
  AgentModelOption,
  AgentStatus,
  AppInfo,
  UpdateStatus,
} from "../../../shared/ipc";
import type { BotProfile } from "../data";
import { featureOn } from "../features";
import { LANGUAGE_OPTIONS, type MessageKey, t } from "../i18n";
import {
  type ActivityStyleChoice,
  activityStyleChoice,
  finishSound,
  type HomeReader,
  homeReader,
  keepAwake,
  language,
  nextSuggestion,
  type SendKey,
  sendKey,
  setActivityStyle,
  setFinishSound,
  setHomeReader,
  setKeepAwake,
  setLanguage,
  setNextSuggestion,
  setSendKey,
  setUiSize,
  type UiSize,
  uiSize,
} from "../preferences";
import { SETTINGS_SECTION_KEY } from "../settings-section";
import { AboutCard } from "./AboutCard";
import { AccountHealth, BackupOrder } from "./AiBackupHealth";
import { AssignmentsSettings } from "./AssignmentsSettings";
import { FeaturesSettings } from "./FeaturesSettings";
import { HostSettings } from "./HostSettings";
import { IntelligenceSettings } from "./IntelligenceSettings";
import { McpSettings } from "./McpSettings";
import { ModelSuggestions } from "./ModelSuggestions";
import { PermissionsSettings } from "./PermissionsSettings";
import { ProviderConnect } from "./ProviderConnect";
import { SkillsSettings } from "./SkillsSettings";
import { StorageView } from "./StorageView";
import { TelegramSettings } from "./TelegramSettings";
import { ThemeSelector } from "./ThemeSelector";
import { Tip } from "./Tip";
import { UpdateControl } from "./UpdateControl";
import { VoiceSettings } from "./VoiceSettings";

type SettingsSection =
  | "general"
  | "ai"
  | "permissions"
  | "skills"
  | "mcp"
  | "assignments"
  | "intelligence"
  | "voice"
  | "telegram"
  | "host"
  | "features"
  | "updates"
  | "data"
  | "storage"
  | "about";

interface SectionItem {
  id: SettingsSection;
  label: MessageKey;
  description: MessageKey;
}

/** A small coloured picture for each settings place, so the list reads at a glance. */
const SECTION_ICONS: Partial<Record<SettingsSection, { tone: string; path: string }>> = {
  general: { tone: "#64748B", path: "M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4" },
  voice: {
    tone: "#E5484D",
    path: "M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm6-3a6 6 0 0 1-12 0m6 6v3",
  },
  host: {
    tone: "#0EA5E9",
    path: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 15h2",
  },
  telegram: { tone: "#2AABEE", path: "M21 4 3 11l6 2.5L11.5 20 21 4zM9 13.5 21 4" },
  ai: {
    tone: "#7C3AED",
    path: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z",
  },
  permissions: {
    tone: "#16A34A",
    path: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zm-3 9 2 2 4-4",
  },
  skills: {
    tone: "#F59E0B",
    path: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm0 13a3 3 0 0 1 3-3h11",
  },
  mcp: { tone: "#0891B2", path: "M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0V8zm5 8v5" },
  assignments: {
    tone: "#3346A6",
    path: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9.2a3 3 0 1 0-1-5.8m2 15h4a5 5 0 0 0-4.5-5",
  },
  intelligence: {
    tone: "#DB2777",
    path: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  },
  features: {
    tone: "#EA580C",
    path: "M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zm8 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  },
  updates: { tone: "#2563EB", path: "M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" },
  data: { tone: "#475569", path: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9z" },
  storage: {
    tone: "#0D9488",
    path: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zm0 0v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
  },
  about: { tone: "#1F2A5C", path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9.5v.5" },
};

/** Settings sections, grouped the way people look for them: their own setup, the team, the app. */
const SECTION_GROUPS: Array<{ label: MessageKey; items: SectionItem[] }> = [
  {
    label: "setGroupPersonal",
    items: [
      { id: "general", label: "setGeneral", description: "setDescGeneral" },
      { id: "voice", label: "setVoice", description: "setDescVoice" },
      { id: "host", label: "setHost", description: "setDescHost" },
      { id: "telegram", label: "setTelegram", description: "setDescTelegram" },
    ],
  },
  {
    label: "setGroupCoworkers",
    items: [
      { id: "ai", label: "setAi", description: "setDescAi" },
      { id: "permissions", label: "setPermissions", description: "setDescPermissions" },
      { id: "skills", label: "setSkills", description: "setDescSkills" },
      { id: "mcp", label: "setMcp", description: "setDescMcp" },
      { id: "assignments", label: "assignmentsTitle", description: "setDescAssignments" },
      { id: "intelligence", label: "setIntelligence", description: "setDescIntelligence" },
    ],
  },
  {
    label: "setGroupApp",
    items: [
      { id: "features", label: "setFeatures", description: "setDescFeatures" },
      { id: "updates", label: "updates", description: "setDescUpdates" },
      { id: "data", label: "dataPrivacy", description: "setDescData" },
      { id: "storage", label: "setStorage", description: "setDescStorage" },
      { id: "about", label: "about", description: "setDescAbout" },
    ],
  },
];
const SECTIONS: SectionItem[] = SECTION_GROUPS.flatMap((group) => group.items);
/** The settings most owners need. Everything else is one tap away under "Show all settings". */
const SIMPLE_SECTIONS: SettingsSection[] = [
  "general",
  "voice",
  "telegram",
  "ai",
  "updates",
  "about",
];
const ALL_SETTINGS_KEY = "sahkarmi:settings-all";

function storedShowAll(): boolean {
  try {
    return window.localStorage.getItem(ALL_SETTINGS_KEY) === "1";
  } catch {
    return false;
  }
}
const SECTION_KEY = SETTINGS_SECTION_KEY;

function storedSection(): SettingsSection {
  try {
    const value = window.localStorage.getItem(SECTION_KEY);
    return SECTIONS.some((section) => section.id === value)
      ? (value as SettingsSection)
      : "general";
  } catch {
    return "general";
  }
}

interface SettingsViewProps {
  appInfo: AppInfo | null;
  agentStatus: AgentStatus;
  updateStatus: UpdateStatus;
  bots: BotProfile[];
  modelOptions: AgentModelOption[];
  onUpdateModel: (botId: string, model: AgentModelId) => Promise<void>;
  onOpenPermissions: () => void;
  onUpdateAction: () => Promise<void>;
}

const UI_SIZES: Array<{ value: UiSize; label: MessageKey }> = [
  { value: "compact", label: "uiSizeCompact" },
  { value: "normal", label: "uiSizeNormal" },
];
const ON_OFF: Array<{ value: "on" | "off"; label: MessageKey }> = [
  { value: "on", label: "switchOn" },
  { value: "off", label: "switchOff" },
];
const HOME_READERS: Array<{ value: HomeReader; label: MessageKey }> = [
  { value: "free", label: "homeReaderFree" },
  { value: "coworker", label: "homeReaderCoworker" },
];
const SEND_KEYS: Array<{ value: SendKey; label: MessageKey }> = [
  { value: "enter", label: "sendKeyEnter" },
  { value: "ctrl-enter", label: "sendKeyCtrlEnter" },
];
const ACTIVITY_STYLES: Array<{ value: ActivityStyleChoice; label: MessageKey }> = [
  { value: "auto", label: "activityAuto" },
  { value: "masti", label: "activityMasti" },
  { value: "seedha", label: "activitySeedha" },
  { value: "english", label: "activityEnglish" },
];

export function SettingsView(props: SettingsViewProps) {
  const [message, setMessage] = createSignal<string | null>(null);
  const [section, setSection] = createSignal<SettingsSection>(storedSection());
  // Simple view: fewer places in the menu. Nothing is removed; "Show all settings" brings back
  // every one, and a section opened from elsewhere (for example Permissions) always shows.
  const [showAll, setShowAll] = createSignal(storedShowAll());
  const simple = () => featureOn("simple-home") && !showAll();
  const visibleGroups = () =>
    SECTION_GROUPS.map((group) => ({
      ...group,
      items: simple()
        ? group.items.filter((item) => SIMPLE_SECTIONS.includes(item.id) || item.id === section())
        : group.items,
    })).filter((group) => group.items.length > 0);
  function toggleShowAll() {
    const next = !showAll();
    setShowAll(next);
    try {
      window.localStorage.setItem(ALL_SETTINGS_KEY, next ? "1" : "0");
    } catch {
      // The choice is a convenience; every setting is still reachable.
    }
  }

  function select(next: SettingsSection) {
    setSection(next);
    try {
      window.localStorage.setItem(SECTION_KEY, next);
    } catch {
      // Remembering the section is a convenience only.
    }
  }

  const panel = (id: SettingsSection, content: () => JSX.Element) => {
    const item = SECTIONS.find((entry) => entry.id === id);
    return (
      <Show when={section() === id}>
        <div
          class="settings-panel"
          role="tabpanel"
          id={`settings-${id}`}
          aria-labelledby={`settings-tab-${id}`}
        >
          <Show when={item}>
            {(entry) => (
              <header class="settings-panel-header">
                <h2>{t(entry().label)}</h2>
                <p>{t(entry().description)}</p>
              </header>
            )}
          </Show>
          {content()}
        </div>
      </Show>
    );
  };

  const segmented = <T extends string>(
    label: MessageKey,
    options: Array<{ value: T; label: MessageKey }>,
    current: () => T,
    choose: (value: T) => void,
  ) => (
    <fieldset class="segmented">
      <legend class="sr-only">{t(label)}</legend>
      <For each={options}>
        {(option) => (
          <button
            type="button"
            aria-pressed={current() === option.value}
            classList={{ "segmented-active": current() === option.value }}
            onClick={() => choose(option.value)}
          >
            {t(option.label)}
          </button>
        )}
      </For>
    </fieldset>
  );

  /** One setting: its name and help on the left, the control on the right (or below it). */
  const row = (
    label: MessageKey,
    hint: MessageKey | null,
    control: JSX.Element | null,
    stacked = false,
  ) => (
    <div class="settings-row" classList={{ "settings-row-stacked": stacked }}>
      <div class="settings-row-text">
        <h3>{t(label)}</h3>
        <Show when={hint}>{(key) => <p class="settings-meta">{t(key())}</p>}</Show>
      </div>
      <Show when={control}>
        <div class="settings-row-control">{control}</div>
      </Show>
    </div>
  );

  function run(action: () => Promise<unknown>) {
    setMessage(null);
    void action().catch((cause) =>
      setMessage(cause instanceof Error ? cause.message : String(cause)),
    );
  }

  return (
    <section class="center-view settings-view" aria-labelledby="settings-heading">
      <header class="center-view-header window-drag">
        <h1 id="settings-heading">{t("settings")}</h1>
      </header>
      <div class="center-view-body settings-layout">
        <div
          class="settings-nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("settings")}
        >
          <For each={visibleGroups()}>
            {(group) => (
              <div class="settings-nav-group" role="presentation">
                <span class="settings-nav-label" aria-hidden="true">
                  {t(group.label)}
                </span>
                <For each={group.items}>
                  {(item) => (
                    <button
                      type="button"
                      role="tab"
                      id={`settings-tab-${item.id}`}
                      aria-selected={section() === item.id}
                      aria-controls={`settings-${item.id}`}
                      classList={{ "settings-nav-active": section() === item.id }}
                      onClick={() => select(item.id)}
                    >
                      <Show when={SECTION_ICONS[item.id]}>
                        {(icon) => (
                          <span
                            class="settings-nav-icon"
                            style={{ "--tile": icon().tone }}
                            aria-hidden="true"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d={icon().path} />
                            </svg>
                          </span>
                        )}
                      </Show>
                      <span class="settings-nav-text">{t(item.label)}</span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
          <Show when={featureOn("simple-home")}>
            <button
              type="button"
              class="settings-show-all"
              aria-pressed={showAll()}
              onClick={toggleShowAll}
            >
              {showAll() ? t("settingsShowFewer") : t("settingsShowAll")}
            </button>
          </Show>
        </div>
        <div class="settings-content">
          {panel("general", () => (
            <>
              <section class="settings-card">
                <h2>{t("setCardLook")}</h2>
                {row("appearance", "themeHint", <ThemeSelector />, true)}
                {row(
                  "uiSizeLabel",
                  "uiSizeHint",
                  segmented("uiSizeLabel", UI_SIZES, uiSize, setUiSize),
                )}
              </section>
              <section class="settings-card">
                <h2>{t("setCardLanguage")}</h2>
                {row(
                  "languageLabel",
                  "languageHint",
                  <fieldset class="segmented segmented-wrap">
                    <legend class="sr-only">{t("languageLabel")}</legend>
                    <For each={LANGUAGE_OPTIONS}>
                      {(option) => (
                        <button
                          type="button"
                          lang={option.code}
                          aria-pressed={language() === option.code}
                          classList={{ "segmented-active": language() === option.code }}
                          onClick={() => setLanguage(option.code)}
                        >
                          {option.label}
                        </button>
                      )}
                    </For>
                  </fieldset>,
                  true,
                )}
                {row(
                  "activityStyleTitle",
                  "activityStyleHint",
                  segmented(
                    "activityStyleTitle",
                    ACTIVITY_STYLES,
                    activityStyleChoice,
                    setActivityStyle,
                  ),
                  true,
                )}
              </section>
              <section class="settings-card">
                <h2>{t("setCardKeyboard")}</h2>
                {row(
                  "sendKeyLabel",
                  null,
                  segmented("sendKeyLabel", SEND_KEYS, sendKey, setSendKey),
                  true,
                )}
                {row("shortcutsLabel", "shortcutsHint", null)}
              </section>
              <section class="settings-card">
                <h2>{t("homeReaderCard")}</h2>
                {row(
                  "homeReaderLabel",
                  "homeReaderHint",
                  segmented("homeReaderLabel", HOME_READERS, homeReader, setHomeReader),
                  true,
                )}
                {row(
                  "nextSuggestionLabel",
                  "nextSuggestionHint",
                  segmented(
                    "nextSuggestionLabel",
                    ON_OFF,
                    () => (nextSuggestion() ? "on" : "off"),
                    (value) => setNextSuggestion(value === "on"),
                  ),
                  true,
                )}
              </section>
              <section class="settings-card">
                <h2>{t("comfortCard")}</h2>
                {row(
                  "finishSoundLabel",
                  "finishSoundHint",
                  segmented(
                    "finishSoundLabel",
                    ON_OFF,
                    () => (finishSound() ? "on" : "off"),
                    (value) => setFinishSound(value === "on"),
                  ),
                  true,
                )}
                {row(
                  "keepAwakeLabel",
                  "keepAwakeHint",
                  segmented(
                    "keepAwakeLabel",
                    ON_OFF,
                    () => (keepAwake() ? "on" : "off"),
                    (value) => setKeepAwake(value === "on"),
                  ),
                  true,
                )}
              </section>
            </>
          ))}

          {panel("ai", () => (
            <>
              <AccountHealth
                agentStatus={props.agentStatus}
                bots={props.bots}
                onShowBackup={() =>
                  document
                    .getElementById("backup-order")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
              />
              <BackupOrder agentStatus={props.agentStatus} />
              <section class="settings-card">
                <h2>{t("providers")}</h2>
                <p>{t("connectIntro")}</p>
                <Tip id="models" text="tipModels" />
                <ProviderConnect agentStatus={props.agentStatus} />
                <p class="settings-meta provider-permissions-link">
                  <button type="button" class="link-button" onClick={props.onOpenPermissions}>
                    {t("connectPermissionsLink")}
                  </button>
                </p>
              </section>
              <section class="settings-card">
                <h2>{t("suggestTitle")}</h2>
                <Show
                  when={featureOn("model-suggestions")}
                  fallback={<p class="settings-meta">{t("suggestOff")}</p>}
                >
                  <ModelSuggestions
                    bots={props.bots}
                    agentStatus={props.agentStatus}
                    modelOptions={props.modelOptions}
                    onApply={props.onUpdateModel}
                  />
                </Show>
              </section>
            </>
          ))}

          {panel("permissions", () => (
            <section class="settings-card">
              <PermissionsSettings bots={props.bots} />
            </section>
          ))}

          {panel("voice", () => (
            <section class="settings-card">
              <VoiceSettings />
              <h3>{t("voiceNotesTitle")}</h3>
              <p>{t("voiceSettingsNotes")}</p>
              <p class="settings-meta">{t("voiceSettingsPrivacy")}</p>
              <p class="settings-meta">{t("voiceTranscriptHonest")}</p>
              <p class="settings-meta">
                {featureOn("live-dictation") ? t("voiceDictationOn") : t("voiceDictationOff")}
              </p>
            </section>
          ))}

          {panel("skills", () => (
            <section class="settings-card">
              <SkillsSettings />
            </section>
          ))}

          {panel("mcp", () => (
            <section class="settings-card">
              <McpSettings />
            </section>
          ))}

          {panel("assignments", () => (
            <section class="settings-card">
              <AssignmentsSettings />
            </section>
          ))}

          {panel("intelligence", () => (
            <IntelligenceSettings />
          ))}

          {panel("telegram", () => (
            <section class="settings-card">
              <TelegramSettings bots={props.bots} />
            </section>
          ))}

          {panel("host", () => (
            <section class="settings-card">
              <HostSettings />
            </section>
          ))}

          {panel("features", () => (
            <section class="settings-card">
              <FeaturesSettings />
            </section>
          ))}

          {panel("updates", () => (
            <section class="settings-card">
              <Show
                when={props.updateStatus.phase !== "unsupported"}
                fallback={<p class="settings-meta">{props.updateStatus.message}</p>}
              >
                <p class="settings-meta">{t("updateAutomatic")}</p>
                <UpdateControl status={props.updateStatus} onAction={props.onUpdateAction} />
              </Show>
              <p class="settings-meta">{t("updatePermissionHint")}</p>
            </section>
          ))}

          {panel("data", () => (
            <section class="settings-card">
              <p class="settings-meta">{t("dataStoredLocally")}</p>
              <div class="settings-buttons">
                <button
                  type="button"
                  onClick={() => run(() => window.sahkarmi.maintenance.exportData())}
                >
                  {t("exportData")}
                </button>
                <button
                  type="button"
                  onClick={() => run(() => window.sahkarmi.maintenance.exportDiagnostics())}
                >
                  {t("exportDiagnostics")}
                </button>
              </div>
            </section>
          ))}

          {panel("storage", () => (
            <StorageView />
          ))}

          {panel("about", () => (
            <AboutCard version={props.appInfo?.version ?? null} />
          ))}
        </div>

        <Show when={message()}>
          <p class="center-view-error" role="alert">
            {message()}
          </p>
        </Show>
      </div>
    </section>
  );
}
