import { createSignal, For, Show } from "solid-js";
import type { PinnedMessage } from "../../../shared/ipc";
import { t } from "../i18n";

/** First line of a pin, short enough for a chip. */
export function pinTitle(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((part) => part.replace(/^[#>*\-\s]+/u, "").trim())
      .find(Boolean) ?? "";
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

/**
 * The chat's pinned messages as chips above the chat. A tap opens the pin to read or copy it
 * and jumps to the message when it is on screen.
 */
export function PinnedMessages(props: {
  pins: PinnedMessage[];
  onUnpin: (pin: PinnedMessage) => void;
}) {
  const [open, setOpen] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);
  const current = () => props.pins.find((pin) => pin.messageId === open()) ?? null;

  function show(pin: PinnedMessage) {
    setCopied(false);
    setOpen((id) => (id === pin.messageId ? null : pin.messageId));
    const row = document.querySelector(`[data-message-id="${CSS.escape(pin.messageId)}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <Show when={props.pins.length > 0}>
      <section class="pinned-bar" aria-label={t("pinnedTitle")}>
        <div class="pinned-chips">
          <span class="pinned-label">📌 {t("pinnedTitle")}</span>
          <For each={props.pins}>
            {(pin) => (
              <button
                type="button"
                class="pinned-chip"
                aria-expanded={open() === pin.messageId}
                onClick={() => show(pin)}
              >
                {pinTitle(pin.text)}
              </button>
            )}
          </For>
        </div>
        <Show when={current()}>
          {(pin) => (
            <div class="pinned-open">
              <p>{pin().text}</p>
              <div class="pinned-open-actions">
                <button
                  type="button"
                  class="link-button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(pin().text).then(() => setCopied(true));
                  }}
                >
                  {copied() ? t("pinnedCopied") : t("pinnedCopy")}
                </button>
                <button
                  type="button"
                  class="link-button"
                  onClick={() => {
                    props.onUnpin(pin());
                    setOpen(null);
                  }}
                >
                  {t("pinUnpin")}
                </button>
              </div>
            </div>
          )}
        </Show>
      </section>
    </Show>
  );
}
