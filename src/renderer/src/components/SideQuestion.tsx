import { createEffect, createSignal, on, Show } from "solid-js";
import type { BotMessage, BotProfile } from "../data";
import { t } from "../i18n";
import { language } from "../preferences";

function languageInEnglish(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * "Ask on the side": while a coworker is busy, the owner asks something quick here. A free AI
 * answers from the chat so far, in a run of its own, so the job is not disturbed. Nothing asked
 * here goes into the coworker's chat.
 */
export function SideQuestion(props: {
  bot: BotProfile | undefined;
  messages: BotMessage[];
  /** The coworker is busy: the "Ask on the side" button shows. An open answer stays after. */
  working: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [question, setQuestion] = createSignal("");
  const [asked, setAsked] = createSignal("");
  const [answer, setAnswer] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  const [waiting, setWaiting] = createSignal(false);
  let token = 0;
  let box: HTMLInputElement | undefined;

  // Another coworker's chat: a question asked in the last one does not follow the owner here.
  createEffect(
    on(
      () => props.bot?.id,
      () => {
        token += 1;
        setOpen(false);
        setQuestion("");
        setAsked("");
        setAnswer(null);
        setFailed(false);
        setWaiting(false);
      },
      { defer: true },
    ),
  );

  async function ask() {
    const words = question().trim();
    const send = window.sahkarmi?.home?.sideAnswer;
    if (!words || !send || waiting()) return;
    token += 1;
    const mine = token;
    setAsked(words);
    setQuestion("");
    setAnswer(null);
    setFailed(false);
    setWaiting(true);
    const said = props.messages.filter(
      (message) => (message.kind === "text" || !message.kind) && message.body.trim(),
    );
    const job = [...said].reverse().find((message) => message.author === "you")?.body ?? "";
    try {
      const reply = await send({
        question: words,
        coworkerName: props.bot?.name ?? "",
        coworkerRole: props.bot?.role ?? "",
        job,
        recent: said.slice(-8).map((message) => ({
          from: message.author === "you" ? ("owner" as const) : ("coworker" as const),
          text: message.body,
        })),
        language: languageInEnglish(language()),
      });
      if (mine !== token) return;
      setAnswer(reply);
      setFailed(reply === null);
    } catch {
      if (mine === token) setFailed(true);
    } finally {
      if (mine === token) setWaiting(false);
    }
  }

  return (
    <Show when={props.working || open()}>
      <div class="side-question">
        <Show
          when={open()}
          fallback={
            <button
              type="button"
              class="side-question-open"
              onClick={() => {
                setOpen(true);
                queueMicrotask(() => box?.focus());
              }}
            >
              <span aria-hidden="true">💬</span>
              {t("sideAskOpen")}
            </button>
          }
        >
          <section class="side-question-panel" aria-label={t("sideAskOpen")}>
            <p class="side-question-note">{t("sideAskNote")}</p>
            <form
              class="side-question-form"
              onSubmit={(event) => {
                event.preventDefault();
                void ask();
              }}
            >
              <input
                ref={box}
                type="text"
                value={question()}
                maxLength={1000}
                placeholder={t("sideAskPlaceholder")}
                aria-label={t("sideAskPlaceholder")}
                onInput={(event) => setQuestion(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpen(false);
                }}
              />
              <button
                type="submit"
                class="button-primary"
                disabled={!question().trim() || waiting()}
              >
                {t("sideAskSend")}
              </button>
              <button
                type="button"
                class="side-question-close"
                aria-label={t("sideAskClose")}
                title={t("sideAskClose")}
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </form>
            <Show when={asked()}>
              <div class="side-question-answer" role="status">
                <p class="side-question-asked">{asked()}</p>
                <Show when={waiting()}>
                  <p class="side-question-waiting">{t("sideAskWaiting")}</p>
                </Show>
                <Show when={answer()}>{(text) => <p class="side-question-text">{text()}</p>}</Show>
                <Show when={failed() && !waiting()}>
                  <p class="side-question-waiting">{t("sideAskFailed")}</p>
                </Show>
              </div>
            </Show>
          </section>
        </Show>
      </div>
    </Show>
  );
}
