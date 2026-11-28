import { createSignal } from "solid-js";
import { apisEn } from "./i18n-apis";
import { assignEn } from "./i18n-assign";
import { backgroundEn } from "./i18n-background";
import { connectorsEn } from "./i18n-connectors";
import { engineEn } from "./i18n-engine";
import { extensionsEn } from "./i18n-extensions";
import { extrasEn } from "./i18n-extras";
import { hostEn } from "./i18n-host";
import { intelligenceEn } from "./i18n-intelligence";
import { marketplaceEn } from "./i18n-marketplace";
import { mcpEn } from "./i18n-mcp";
import { memoryEn } from "./i18n-memory";
import { onboardingEn } from "./i18n-onboarding";
import { revampEn } from "./i18n-revamp";
import { safetyEn } from "./i18n-safety";
import { securityEn } from "./i18n-security";
import { skillPacksEn } from "./i18n-skill-packs";
import { storageEn } from "./i18n-storage";
import { workspaceEn } from "./i18n-workspace";
import { type LanguageCode, language } from "./preferences";

const en = {
  workspaceTeam: "Team and CEO",
  workspaceCeo: "CEO of this workspace",
  workspaceNoCeo: "No CEO",
  workspaceCeoHint:
    "The CEO hands out work to everyone else here, collects their results and reports to you. You stay in charge.",
  approvalAuthority: "Approvals the CEO may decide",
  approvalAuthorityHint:
    "Nothing unless you tick it, for 24 hours at a time. The CEO can pass part of this to an employee, never more. You can still decide everything yourself.",
  approvalAuthorityGrant: "Give this authority",
  approvalAuthorityRevoke: "Take back",
  approvalRouted: "A coworker with your authority was told about this. You can still decide.",
  approvalDecidedByCoworker: "Decided by a coworker with your authority.",
  publishingAccounts: "Accounts coworkers may publish as",
  publishingAccountsUnbind: "Remove",
  deleteWorkspace: "Delete workspace",
  deleteWorkspaceOnlyOne: "This is your only workspace, so it cannot be deleted.",
  deleteWorkspaceHint: "Files coworkers saved stay on your computer in every case.",
  deleteWorkspaceCoworkers: "Its coworkers",
  deleteWorkspaceMoveTo: "Move to",
  deleteWorkspaceDeleteCoworkers: "Delete them too",
  deleteWorkspaceConfirmMove:
    "Delete this workspace and move its coworkers? The CEO role and approval authority given here end.",
  deleteWorkspaceConfirmDelete:
    "Delete this workspace and its coworkers? Their chats, schedules, routines and browser sign-ins are removed for good.",
  deleteWorkspaceConfirm: "Yes, delete",
  brandName: "Sahkarmi",
  brandNative: "सहकर्मी",
  tagline: "Your AI team. Made in India.",
  workspace: "Workspace",
  newWorkspace: "New workspace",
  renameWorkspace: "Rename workspace",
  workspaceNamePrompt: "Workspace name",
  team: "Team",
  newCoworker: "New coworker",
  sharedFiles: "Shared files",
  approvals: "Approvals",
  settings: "Settings",
  searchTeam: "Search team",
  noMatches: "No matches",
  noCoworkers: "No coworkers in this workspace yet",
  statusIdle: "Idle",
  statusWorking: "Working",
  statusWaiting: "Waiting for you",
  statusError: "Needs attention",
  editCoworker: "Edit coworker",
  deleteCoworker: "Delete coworker",
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel",
  stop: "Stop",
  paused: "Paused",
  taskQueue: "Task queue",
  queueEmpty: "No tasks yet",
  showAll: "Show all",
  showLess: "Show less",
  toolRunning: "Running",
  toolDone: "Done",
  toolFailed: "Failed",
  input: "Input",
  output: "Output",
  attachFile: "Attach file",
  voiceInput: "Voice input",
  voiceListening: "Listening… tap to stop",
  voiceUnsupported: "Voice input is not available on this device.",
  runOnSchedule: "Run on schedule",
  scheduleOnce: "Once",
  scheduleHourly: "Every hour",
  scheduleDaily: "Every day",
  scheduleWeekdays: "Weekdays (Mon–Fri)",
  scheduleWeekly: "Every week",
  scheduleAt: "at",
  scheduleOn: "on",
  scheduleSaved: "Scheduled",
  schedules: "Schedules",
  noSchedules: "No scheduled tasks for this coworker.",
  nextRun: "Next run",
  runNow: "Run now",
  enable: "Enable",
  disable: "Disable",
  delete: "Delete",
  sendLabel: "Send",
  scheduleLabel: "Schedule",
  browser: "Browser",
  showBrowser: "Show browser",
  hideBrowser: "Hide browser",
  takeOver: "Take over",
  handBack: "Hand back",
  youAreInControl: "You're in control. Coworkers are paused in the browser.",
  takeoverRequested: "asks you to take over",
  takeoverDecline: "Decline",
  secureTitlePassword: "Enter your password",
  secureTitleOtp: "Enter the OTP",
  secureTitlePin: "Enter your PIN",
  secureTitleUsername: "Enter your login ID",
  secureTitleOther: "Enter the value",
  secureSubmitOnce: "Submit once to {origin}",
  secureSignInPage: "Sign-in page",
  secureNotInChat: "This value is not added to chat.",
  secureSubmit: "Submit",
  secureShow: "Show",
  secureHide: "Hide",
  secureClose: "Close request",
  jumpToLatest: "Get to bottom",
  browserExpand: "Expand browser",
  browserRestore: "Restore browser size",
  browserCompact: "Shrink to preview",
  browserOpen: "Open",
  browserPreviewUnavailable: "Preview unavailable",
  browserPages: "Browser pages",
  browserNewPage: "New page",
  browserOpenPage: "Open page",
  browserClosePage: "Close page",
  menuOpenBrowser: "Open Browser",
  menuOpenFiles: "Open Files",
  menuOpenTasks: "Open Tasks",
  menuOpenSettings: "Open Agent settings",
  menuOpenVoice: "Open Voice",
  starterTitle: "Try asking",
  agentConnecting: "Connecting to your AI tools…",
  sending: "Sending…",
  showEarlier: "Show {count} earlier messages",
  toolCreateCoworker: "Create coworker {name}",
  toolMessageTo: "Message to {name}",
  toolSaveMemory: "Save to memory",
  toolSearchMemory: "Search memory",
  toolListMemories: "List memories",
  toolSearchChats: "Search past chats",
  toolListSkills: "List skills",
  toolReadSkill: "Read skill {name}",
  toolSaveSkill: "Save skill {name}",
  toolListKnowledge: "List knowledge bases",
  toolSearchKnowledge: "Search documents",
  toolReadDocument: "Read document",
  toolEditFile: "Edit {name}",
  toolWriteFile: "Write {name}",
  toolReadFile: "Read {name}",
  toolFile: "File {name}",
  toolCommand: "Command",
  toolCoworker: "coworker",
  toolRanSteps: "Ran {count} steps",
  toolRunningStep: "Running step {current} of {total}",
  toolKindCommandOne: "1 command",
  toolKindCommandMany: "{count} commands",
  toolKindFileOne: "1 file",
  toolKindFileMany: "{count} files",
  toolKindWebOne: "1 web action",
  toolKindWebMany: "{count} web actions",
  toolKindCoworkerOne: "1 coworker message",
  toolKindCoworkerMany: "{count} coworker messages",
  toolKindApprovalOne: "1 approval",
  toolKindApprovalMany: "{count} approvals",
  toolKindToolOne: "1 app action",
  toolKindToolMany: "{count} app actions",
  approvalKeys: "Enter allows once · Esc does not allow",
  planTitle: "Plan",
  planProgress: "{done} of {total} done",
  planStatus_pending: "Not started",
  planStatus_in_progress: "In progress",
  planStatus_completed: "Done",
  sendNow: "Add to this task now",
  sendNowHint:
    "Gives this message to the coworker now. It pauses for a moment, reads it, and carries on with the same task using your instruction.",
  stopHint: "Stop (Esc)",
  queueHint: "Send: it waits until the current task is done",
  steerHint: "Send: the coworker reads it while it works and adjusts, without stopping",
  agentSetupRequired: "Agent CLI setup required",
  agentSetupHint: "Install and sign in to Codex CLI or Claude CLI, then restart Sahkarmi.",
  agentSetupGuide: "Setup guide",
  afterThisTurn: "After this turn",
  branchFromHere: "Branch from here",
  branchedFrom: "Branched from {name}",
  branchedFromDeleted: "Branched from a coworker that was deleted",
  openSource: "Open",
  branchWait: "Wait for the coworker to finish, then branch.",
  instructions: "Instructions",
  instructionsHint: "Standing rules this coworker follows, kept in its folder",
  instructionsEmpty: "No rules yet. Edit to add some, or ask the coworker to remember one.",
  instructionsConflict: "The file changed since you opened it. Save again to replace that version.",
  showInFolder: "Show in folder",
  edit: "Edit",
  save: "Save",
  saveAnyway: "Save anyway",
  newFolder: "New folder",
  newFolderInside: "New folder inside",
  renameFolder: "Rename folder",
  deleteFolder: "Delete folder",
  moveUp: "Move up",
  moveDown: "Move down",
  moveOutOfFolder: "Move out of this folder",
  moveToFolder: "Move to folder",
  noFolder: "No folder",
  folderNamePrompt: "Folder name",
  folderMenu: "Folder menu",
  afterThisTurnDetail: "{current} finishes this turn. {next} starts with the next one.",
  providerSilent: "{provider} has sent no update for {duration}.",
  noInternet: "No internet connection",
  noInternetDetail: "{provider} cannot reply until this computer is online again.",
  minuteOne: "1 minute",
  minutesMany: "{count} minutes",
  handBackNote: "Note for the coworker (optional)",
  approvalsEmpty:
    "Nothing waiting. Coworkers ask here before paying, sending, publishing or submitting.",
  pending: "Pending",
  history: "History",
  approve: "Approve",
  reject: "Reject",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  addNote: "Add a note (optional)",
  categoryPayment: "Payment",
  categoryMessage: "Message to customer/vendor",
  categorySubmission: "Form submission",
  categoryData: "Data",
  categoryOther: "Other",
  sharedFilesIntro: "Every coworker can read and write this folder.",
  addFiles: "Add files",
  openFolder: "Show in folder",
  open: "Open",
  emptyFolder: "This folder is empty.",
  up: "Up",
  appearance: "Theme",
  themeSystem: "System",
  themeLight: "Paper (light)",
  themeDark: "Night (dark)",
  languageLabel: "Language",
  uiSizeLabel: "Interface size",
  uiSizeCompact: "Compact",
  uiSizeNormal: "Normal",
  sendKeyLabel: "Send key",
  sendKeyEnter: "Enter · Shift+Enter for a new line",
  sendKeyCtrlEnter: "Ctrl+Enter · Enter for a new line",
  shortcutsLabel: "Keyboard shortcuts",
  shortcutsHint:
    "Ctrl+K search · Ctrl+1–9 open a coworker · Ctrl+N new coworker · Ctrl+, settings · Esc close",
  searchEverything: "Search coworkers and messages",
  searchEverythingHint: "Type a name, a role or any words from a message…",
  searchCoworkers: "Coworkers",
  searchMessages: "Messages",
  searchNothing: "Nothing matched.",
  searching: "Searching…",
  you: "You",
  deletedCoworker: "Deleted {name}",
  undo: "Undo",
  sendAgain: "Send again",
  dangerZone: "Danger zone",
  deleteCoworkerConfirm: "Delete {name} and all its messages?",
  providers: "AI providers",
  providersHint: "Choose Codex or Claude and review what coworkers may do.",
  manage: "Manage",
  dataPrivacy: "Data & privacy",
  exportData: "Export my data",
  exportDiagnostics: "Export diagnostics",
  updates: "Updates",
  checkUpdates: "Check for updates",
  updateChecking: "Checking for updates…",
  updateDownloading: "Downloading update",
  updateRestart: "Restart to update",
  updateInstalling: "Installing update…",
  updateDownload: "Download update",
  updateRetry: "Retry update",
  updateCurrent: "You’re up to date.",
  updateAutomatic: "Updates download in the background and install when you quit.",
  updateActionFailed: "Could not update. Please try again.",
  about: "About",
  aboutTagline: "A free AI team for every business, whatever your work. Made in India.",
  aboutFounder: "Founder",
  aboutFounderLine:
    "Building Sahkarmi so one person with an idea can run like a full team, in their own language.",
  aboutContact: "Talk to the founder",
  aboutEmail: "Email",
  aboutFollow: "Follow Sahkarmi",
  aboutBody:
    "Sahkarmi runs on your computer. Coworkers use your local Codex or Claude sign-in; there is no Sahkarmi cloud account.",
  attribution: "Sahkarmi — Your autonomous AI coworker team. Made with pride in India.",
  stopAll: "Stop all coworkers",
  role: "Role",
  messagePlaceholder: "Message {name}",
  schedulePlaceholder: "What should {name} do on schedule?",
  close: "Close",
  ...workspaceEn,
  ...marketplaceEn,
  ...extensionsEn,
  ...storageEn,
  ...backgroundEn,
  ...memoryEn,
  ...securityEn,
  ...apisEn,
  ...engineEn,
  ...safetyEn,
  ...assignEn,
  ...intelligenceEn,
  ...extrasEn,
  ...mcpEn,
  ...connectorsEn,
  ...skillPacksEn,
  ...onboardingEn,
  ...hostEn,
  ...revampEn,
};

export type Dictionary = typeof en;
export type MessageKey = keyof Dictionary;

export const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "ar", label: "العربية" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "he", label: "עברית" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "tr", label: "Türkçe" },
  { code: "zh", label: "简体中文" },
];

/** Kept as plain text so the splash line never waits for a language pack. */
export const TAGLINES: Record<LanguageCode, string> = {
  en: en.tagline,
  hi: "आपकी AI टीम. भारत में बनी.",
  bn: "আপনার AI টিম. ভারতে তৈরি.",
  ar: "فريقك من الذكاء الاصطناعي. صُنع في الهند.",
  de: "Dein KI-Team. Made in India.",
  es: "Tu equipo de IA. Hecho en India.",
  fr: "Votre équipe IA. Conçue en Inde.",
  he: "צוות ה-AI שלך. נבנה בהודו.",
  it: "Il tuo team di IA. Fatto in India.",
  ja: "あなたのAIチーム。インド生まれ。",
  ko: "당신의 AI 팀. 인도에서 만들었습니다.",
  nl: "Jouw AI-team. Gemaakt in India.",
  pl: "Twój zespół AI. Stworzony w Indiach.",
  pt: "Sua equipe de IA. Feita na Índia.",
  ru: "Ваша команда ИИ. Сделано в Индии.",
  tr: "Yapay zekâ ekibin. Hindistan'da yapıldı.",
  zh: "你的 AI 团队。印度制造。",
};

type Pack = Partial<Dictionary>;

/**
 * Only English ships in the first renderer bundle. Every other language is its own chunk,
 * fetched when it becomes the app language (index.tsx waits for it before the first render).
 */
const LOADERS: Record<Exclude<LanguageCode, "en">, () => Promise<Pack>> = {
  hi: () => import("./i18n-hi").then((pack) => pack.hi),
  bn: () => import("./i18n-bn").then((pack) => pack.bn),
  ar: () => import("./i18n-world").then((pack) => pack.ar),
  de: () => import("./i18n-world").then((pack) => pack.de),
  es: () => import("./i18n-world").then((pack) => pack.es),
  fr: () => import("./i18n-world").then((pack) => pack.fr),
  he: () => import("./i18n-world").then((pack) => pack.he),
  it: () => import("./i18n-world").then((pack) => pack.it),
  ja: () => import("./i18n-world").then((pack) => pack.ja),
  ko: () => import("./i18n-world").then((pack) => pack.ko),
  nl: () => import("./i18n-world").then((pack) => pack.nl),
  pl: () => import("./i18n-world").then((pack) => pack.pl),
  pt: () => import("./i18n-world").then((pack) => pack.pt),
  ru: () => import("./i18n-world").then((pack) => pack.ru),
  tr: () => import("./i18n-world").then((pack) => pack.tr),
  zh: () => import("./i18n-world").then((pack) => pack.zh),
};

const [packs, setPacks] = createSignal<Partial<Record<LanguageCode, Pack>>>({ en });
const pending = new Map<LanguageCode, Promise<void>>();

/** Loads a language pack once; t() re-renders with it when it arrives. */
export function loadLanguage(code: LanguageCode): Promise<void> {
  if (code === "en" || packs()[code]) return Promise.resolve();
  const existing = pending.get(code);
  if (existing) return existing;
  const loading = LOADERS[code]()
    .then((pack) => {
      setPacks((current) => ({ ...current, [code]: pack }));
    })
    .catch(() => {
      // English stays on screen; the next t() call for this language tries again.
      pending.delete(code);
    });
  pending.set(code, loading);
  return loading;
}

/** Reactive translation: reads the current language signal (English until its pack loads). */
export function t(key: MessageKey, values: Record<string, string> = {}): string {
  const code = language();
  const dict = packs()[code];
  if (!dict) void loadLanguage(code);
  const template = dict?.[key] ?? en[key] ?? "";
  const text = template.replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
  return typeof document !== "undefined" && document.documentElement.dataset.platform === "darwin"
    ? macWording(text)
    : text;
}

/**
 * The words were written for Windows. On a Mac "this PC" reads "this Mac" and the shortcuts
 * show the Command key (the app takes Command wherever it takes Ctrl).
 */
export function macWording(text: string): string {
  return text.replace(/\bCtrl\s?\+\s?/g, "⌘").replace(/\bPC\b/g, "Mac");
}
