import { createMemo, For } from "solid-js";
import { LANGUAGE_OPTIONS, t } from "../i18n";
import type { LanguageCode } from "../preferences";
import { LogoMark } from "./Logo";

/** The English name and a short tag beside each language's own name. */
const ENGLISH_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  ar: "Arabic",
  de: "German",
  es: "Spanish",
  fr: "French",
  he: "Hebrew",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  tr: "Turkish",
  zh: "Chinese",
};

/** How many rows show above and below the chosen one. */
const REACH = 2;

interface LanguageWheelProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  onContinue: () => void;
}

/**
 * The first thing a new owner sees: one language in the middle, its neighbours fading above
 * and below. Mouse wheel, arrow keys, the two arrow buttons or a click on a row move it;
 * Enter or Continue moves on. English is chosen until the owner turns the wheel.
 */
export function LanguageWheel(props: LanguageWheelProps) {
  const index = createMemo(() =>
    Math.max(
      0,
      LANGUAGE_OPTIONS.findIndex((option) => option.code === props.value),
    ),
  );
  let lastWheel = 0;

  const move = (step: number) => {
    const next = Math.min(LANGUAGE_OPTIONS.length - 1, Math.max(0, index() + step));
    if (next !== index()) props.onChange(LANGUAGE_OPTIONS[next].code);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // One notch, one row: a trackpad sends many small events.
    const now = Date.now();
    if (now - lastWheel < 140 || Math.abs(event.deltaY) < 4) return;
    lastWheel = now;
    move(event.deltaY > 0 ? 1 : -1);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Home") props.onChange(LANGUAGE_OPTIONS[0].code);
    else if (event.key === "End")
      props.onChange(LANGUAGE_OPTIONS[LANGUAGE_OPTIONS.length - 1].code);
    else if (event.key === "Enter") props.onContinue();
    else return;
    event.preventDefault();
  };

  return (
    <section class="language-wheel-card" aria-labelledby="language-wheel-title">
      <div class="language-wheel-brand">
        <LogoMark size={72} motion="turn" />
        <span class="language-wheel-name">Sahkarmi</span>
      </div>
      <p id="language-wheel-title" class="language-wheel-title">
        {t("startLanguagePick")}
      </p>
      <div class="language-wheel-row">
        <div
          class="language-wheel"
          role="listbox"
          tabIndex={0}
          aria-labelledby="language-wheel-title"
          aria-activedescendant={`language-wheel-${props.value}`}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
          <For each={LANGUAGE_OPTIONS}>
            {(option, i) => {
              const distance = () => i() - index();
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox handles the keys
                <div
                  id={`language-wheel-${option.code}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={distance() === 0}
                  class="language-wheel-item"
                  classList={{ "language-wheel-on": distance() === 0 }}
                  style={{
                    transform: `translateY(${distance() * 56}px) scale(${1 - Math.min(Math.abs(distance()), REACH) * 0.12})`,
                    opacity: Math.abs(distance()) > REACH ? 0 : 1 - Math.abs(distance()) * 0.33,
                    "pointer-events": Math.abs(distance()) > REACH ? "none" : "auto",
                  }}
                  onClick={() => props.onChange(option.code)}
                >
                  <span class="language-wheel-tag">{option.code.toUpperCase()}</span>
                  <span class="language-wheel-label" lang={option.code}>
                    {option.label}
                  </span>
                  <span class="language-wheel-english">
                    {option.code === "en" ? "" : ENGLISH_NAMES[option.code]}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
        <div class="language-wheel-arrows">
          <button
            type="button"
            class="language-wheel-arrow"
            aria-label="Previous language"
            disabled={index() === 0}
            onClick={() => move(-1)}
          >
            ⌃
          </button>
          <button
            type="button"
            class="language-wheel-arrow"
            aria-label="Next language"
            disabled={index() === LANGUAGE_OPTIONS.length - 1}
            onClick={() => move(1)}
          >
            ⌄
          </button>
        </div>
      </div>
      <button type="button" class="language-wheel-continue" onClick={() => props.onContinue()}>
        {t("startLanguageNext")} <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
