import { createSignal, For, Show } from "solid-js";
import { type MessageKey, t } from "../i18n";

const HIDDEN_KEY = "sahkarmi:support-ticker-hidden-until";
/** After the owner closes it, the strip stays away this long. */
const HIDE_DAYS = 14;

const ITEMS: Array<{ label: MessageKey; mark: string; url: string }> = [
  { label: "tickerSupport", mark: "❤", url: "https://github.com/sponsors/ganguydhrubo" },
  { label: "tickerStar", mark: "★", url: "https://github.com/ganguydhrubo/Sahkarmi" },
  { label: "tickerFree", mark: "✦", url: "https://sahkarmi.site" },
];

function hiddenNow(): boolean {
  try {
    return Number(window.localStorage.getItem(HIDDEN_KEY)) > Date.now();
  } catch {
    return false;
  }
}

/**
 * A thin, quiet strip under the title bar that keeps sliding slowly: "Support us on GitHub",
 * "Give a star". It stops while the mouse is on it, stands still for owners who asked their
 * computer for less motion, and the × puts it away for two weeks.
 */
export function SupportTicker() {
  const [hidden, setHidden] = createSignal(hiddenNow());
  const open = (url: string) => void window.sahkarmi.openUrl?.(url)?.catch(() => undefined);
  const run = (copy: boolean) => (
    <span class="support-ticker-run" aria-hidden={copy ? "true" : undefined}>
      <For each={ITEMS}>
        {(item) => (
          <button
            type="button"
            class="support-ticker-item"
            tabIndex={copy ? -1 : 0}
            onClick={() => open(item.url)}
          >
            <span class="support-ticker-mark" aria-hidden="true">
              {item.mark}
            </span>
            {t(item.label)}
          </button>
        )}
      </For>
    </span>
  );
  return (
    <Show when={!hidden()}>
      <section class="support-ticker" aria-label={t("railSupportGroup")}>
        <div class="support-ticker-window">
          <div class="support-ticker-track">
            {run(false)}
            {run(true)}
            {run(true)}
            {run(true)}
          </div>
        </div>
        <button
          type="button"
          class="support-ticker-close"
          aria-label={t("tickerHide")}
          title={t("tickerHide")}
          onClick={() => {
            try {
              window.localStorage.setItem(HIDDEN_KEY, String(Date.now() + HIDE_DAYS * 86_400_000));
            } catch {
              // Not saved: it only comes back sooner.
            }
            setHidden(true);
          }}
        >
          ×
        </button>
      </section>
    </Show>
  );
}
