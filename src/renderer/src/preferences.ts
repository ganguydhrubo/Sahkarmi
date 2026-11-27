import { createSignal } from "solid-js";
import { isTrade, type TradeId } from "./trade-names";

export type ThemePreference = "system" | "light" | "dark";
export type LanguageCode =
  | "en"
  | "hi"
  | "bn"
  | "ar"
  | "de"
  | "es"
  | "fr"
  | "he"
  | "it"
  | "ja"
  | "ko"
  | "nl"
  | "pl"
  | "pt"
  | "ru"
  | "tr"
  | "zh";

export const SUPPORTED_LANGUAGES: LanguageCode[] = [
  "en",
  "hi",
  "bn",
  "ar",
  "de",
  "es",
  "fr",
  "he",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "tr",
  "zh",
];

const THEME_KEY = "sahkarmi:theme";
const TRADE_KEY = "sahkarmi:trade";
const ACTIVITY_STYLE_KEY = "sahkarmi:activity-style";

/**
 * masti: playful Hinglish while thinking · seedha: plain Hinglish · english: plain English.
 * With nothing chosen, activity follows the app language (English unless the app is not).
 */
export type ActivityStyle = "masti" | "seedha" | "english";
/** "auto" follows the app language: Hinglish only when the app is in Hindi, else plain English. */
export type ActivityStyleChoice = ActivityStyle | "auto";
const LANGUAGE_KEY = "sahkarmi:language";
const UI_SIZE_KEY = "sahkarmi:ui-size";
const SEND_KEY_KEY = "sahkarmi:send-key";
const HOME_READER_KEY = "sahkarmi:home-reader";
const FINISH_SOUND_KEY = "sahkarmi:finish-sound";
const KEEP_AWAKE_KEY = "sahkarmi:keep-awake";

/** Large was removed (26 Nov 2026): text was cut in many places. A stored "large" opens as normal. */
export type UiSize = "compact" | "normal";
/** enter: Enter sends, Ctrl/Cmd+Enter adds a line · ctrl-enter: the other way round. */
export type SendKey = "enter" | "ctrl-enter";
const UI_ZOOM: Record<UiSize, number> = { compact: 0.9, normal: 1 };

/** free: a free AI reads the job on Home before Start · coworker: the coworker's own AI reads it after Start. */
export type HomeReader = "free" | "coworker";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; the UI still works with defaults.
  }
}

/**
 * Settings offers only System and Dark (owner's call, 27 Nov: "system and light are the same").
 * System follows Windows, so a light Windows shows the warm paper look. An old stored "light"
 * choice is read as System.
 */
function parseTheme(value: string | null): ThemePreference {
  return value === "dark" ? "dark" : "system";
}

function parseLanguage(value: string | null): LanguageCode {
  return value && SUPPORTED_LANGUAGES.includes(value as LanguageCode)
    ? (value as LanguageCode)
    : "en";
}

const [theme, setThemeSignal] = createSignal<ThemePreference>(parseTheme(readStored(THEME_KEY)));
const [language, setLanguageSignal] = createSignal<LanguageCode>(
  parseLanguage(readStored(LANGUAGE_KEY)),
);

const [activityStyleChoice, setActivityStyleSignal] = createSignal<ActivityStyleChoice>(
  parseActivityStyle(readStored(ACTIVITY_STYLE_KEY)),
);

function parseActivityStyle(value: string | null): ActivityStyleChoice {
  return value === "masti" || value === "seedha" || value === "english" ? value : "auto";
}

/** The style status lines really use. Bengali, Tamil and the rest read plain English, not Hinglish. */
function activityStyle(): ActivityStyle {
  const choice = activityStyleChoice();
  if (choice !== "auto") return choice;
  return language() === "hi" ? "seedha" : "english";
}

const [uiSize, setUiSizeSignal] = createSignal<UiSize>(parseUiSize(readStored(UI_SIZE_KEY)));
const [homeReader, setHomeReaderSignal] = createSignal<HomeReader>(
  readStored(HOME_READER_KEY) === "coworker" ? "coworker" : "free",
);
/** A soft chime when a coworker finishes. On unless the owner switched it off. */
const [finishSound, setFinishSoundSignal] = createSignal(readStored(FINISH_SOUND_KEY) !== "off");
/** Keep the PC from sleeping while Sahkarmi is open, so scheduled work runs. Off by default. */
const [keepAwake, setKeepAwakeSignal] = createSignal(readStored(KEEP_AWAKE_KEY) === "on");
const [sendKey, setSendKeySignal] = createSignal<SendKey>(
  readStored(SEND_KEY_KEY) === "ctrl-enter" ? "ctrl-enter" : "enter",
);

function parseUiSize(value: string | null): UiSize {
  return value === "compact" ? value : "normal";
}

/** The owner's line of work, asked on first open; null until they have chosen. */
const [trade, setTradeSignal] = createSignal<TradeId | null>(
  (() => {
    const stored = readStored(TRADE_KEY);
    return isTrade(stored) ? stored : null;
  })(),
);

export function setTrade(next: TradeId): void {
  setTradeSignal(next);
  writeStored(TRADE_KEY, next);
}

export {
  activityStyle,
  activityStyleChoice,
  finishSound,
  homeReader,
  keepAwake,
  language,
  sendKey,
  theme,
  trade,
  uiSize,
};

export function setFinishSound(on: boolean): void {
  setFinishSoundSignal(on);
  writeStored(FINISH_SOUND_KEY, on ? "on" : "off");
}

export function setKeepAwake(on: boolean): void {
  setKeepAwakeSignal(on);
  writeStored(KEEP_AWAKE_KEY, on ? "on" : "off");
  window.sahkarmi?.setKeepAwake?.(on);
}

export function setHomeReader(next: HomeReader): void {
  setHomeReaderSignal(next);
  writeStored(HOME_READER_KEY, next);
}

export function setUiSize(next: UiSize): void {
  setUiSizeSignal(next);
  writeStored(UI_SIZE_KEY, next);
  applyUiSize(next);
}

export function setSendKey(next: SendKey): void {
  setSendKeySignal(next);
  writeStored(SEND_KEY_KEY, next);
}

/**
 * UI size is Electron's own page zoom, never CSS zoom: CSS zoom left media queries, popover
 * positions, panel dragging and the canvas measuring in different pixels, so boxes broke.
 */
function applyUiSize(next: UiSize): void {
  const style = document.documentElement.style as CSSStyleDeclaration & { zoom: string };
  if (window.sahkarmi?.setUiZoom) {
    style.zoom = "";
    window.sahkarmi.setUiZoom(UI_ZOOM[next]);
  } else {
    // Tests and a plain browser have no Electron bridge.
    style.zoom = next === "normal" ? "" : String(UI_ZOOM[next]);
  }
}

export function setActivityStyle(next: ActivityStyleChoice): void {
  setActivityStyleSignal(next);
  writeStored(ACTIVITY_STYLE_KEY, next);
}

export function setTheme(next: ThemePreference): void {
  setThemeSignal(next);
  writeStored(THEME_KEY, next);
  applyTheme(next);
  void window.sahkarmi?.setTheme?.(next)?.catch(() => undefined);
}

/** Arabic and Hebrew read right to left. */
export function isRtl(code: LanguageCode): boolean {
  return code === "ar" || code === "he";
}

function applyLanguage(code: LanguageCode): void {
  document.documentElement.lang = code;
  document.documentElement.dir = isRtl(code) ? "rtl" : "ltr";
}

/** True once a language was saved: the first-open wheel is only for an owner who never chose. */
export function hasChosenLanguage(): boolean {
  return readStored(LANGUAGE_KEY) !== null;
}

export function setLanguage(next: LanguageCode): void {
  setLanguageSignal(next);
  writeStored(LANGUAGE_KEY, next);
  // A new app language is a clear wish: status lines follow it again instead of an old choice.
  setActivityStyle("auto");
  applyLanguage(next);
}

function applyTheme(next: ThemePreference): void {
  if (next === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
}

export function applyStoredPreferences(): void {
  if (keepAwake()) window.sahkarmi?.setKeepAwake?.(true);
  applyTheme(theme());
  applyUiSize(uiSize());
  void window.sahkarmi?.setTheme?.(theme())?.catch(() => undefined);
  applyLanguage(language());
}

const SPEECH_LOCALES: Record<LanguageCode, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  ar: "ar-SA",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  he: "he-IL",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  nl: "nl-NL",
  pl: "pl-PL",
  pt: "pt-BR",
  ru: "ru-RU",
  tr: "tr-TR",
  zh: "zh-CN",
};

/** BCP-47 tag used for voice input and date formatting. */
export function speechLocale(code: LanguageCode = language()): string {
  return SPEECH_LOCALES[code];
}
