import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import type { BotProfile } from "../data";
import { featureOn } from "../features";
import { t } from "../i18n";
import { language, setTrade, trade } from "../preferences";
import { TRADES, type TradeId, tradeName } from "../trade-names";
import {
  type JobRole,
  noteStarterUsed,
  type StarterJob,
  starterJobs,
  starterUseCounts,
} from "../trades";
import { AgentAvatar } from "./AgentAvatar";
import { VoiceRecorder } from "./VoiceRecorder";

/** Words that point to a kind of work, in English, Hindi and Bengali. */
const ROLE_WORDS: Record<JobRole, RegExp> = {
  accounts:
    /gst|bill|invoice|payment|tds|tax|ledger|account|fee|rent|बिल|भुगतान|बकाया|फ़ीस|टैक्स|হিসাব|বিল|বকেয়া|ফি|ট্যাক্স/i,
  content:
    /post|caption|instagram|facebook|poster|write|letter|email|notice|circular|पोस्ट|लिख|पत्र|सूचना|পোস্ট|লিখ|চিঠি|নোটিস/i,
  sales: /lead|quotation|quote|buyer|follow.?up|order|ग्राहक|कोटेशन|ख़रीदार|ক্রেতা|কোটেশন|লিড/i,
  support: /reply|customer|complaint|patient|parent|enquir|जवाब|शिकायत|मरीज़|উত্তর|অভিযোগ|রোগী/i,
  research: /compare|find|research|summar|rate|supplier|तुलना|खोज|सार|তুলনা|খুঁজ|সারাংশ/i,
  ops: /plan|list|stock|timetable|schedule|sheet|excel|योजना|सूची|स्टॉक|পরিকল্পনা|তালিকা|স্টক|রুটিন/i,
};

/** How a coworker's role reads for each kind of work ("Team · Accounts", "Sales & outreach"). */
const ROLE_NAMES: Record<JobRole, RegExp> = {
  accounts: /account|financ|gst|tax|book.?keep|हिसाब|लेखा|হিসাব/i,
  content: /content|market|writ|social|copy|publish|कंटेंट|লেখা/i,
  sales: /sales|outreach|business dev|सेल्स|বিক্রি/i,
  support: /support|service|customer|help.?desk|सपोर्ट/i,
  research: /research|analy|रिसर्च|গবেষণা/i,
  ops: /\bops\b|operation|admin|office/i,
};
/** The coworker that shares out work: a CEO, a team lead, an orchestrator. */
const LEAD_ROLE = /\blead\b|ceo|chief|orchestrat|manager/i;

/** A long ask, or one with several steps, is better given to a team. */
function looksBig(text: string): boolean {
  const flat = text.trim();
  if (flat.length > 320) return true;
  const steps = flat
    .split(/\n|(?:^|\s)\d+[.)]\s|;| and then | then /i)
    .filter((part) => part.trim());
  return steps.length >= 4;
}

function roleFor(text: string): JobRole | null {
  let best: JobRole | null = null;
  let bestAt = Number.POSITIVE_INFINITY;
  for (const role of Object.keys(ROLE_WORDS) as JobRole[]) {
    const at = text.search(ROLE_WORDS[role]);
    if (at !== -1 && at < bestAt) {
      best = role;
      bestAt = at;
    }
  }
  return best;
}

/**
 * Home: one box for "what do you want done today?", a big microphone, and ready starter jobs
 * for the owner's trade. Sahkarmi suggests who should do the job and says why; the owner can
 * change it. Nothing is sent until Start is pressed.
 */
export function HomeView(props: {
  bots: BotProfile[];
  /** The workspace's CEO, when there is one: jobs with no clear owner go to it. */
  ceoBotId: string | null;
  pendingApprovals: number;
  onSend: (botId: string, text: string) => void | Promise<void>;
  onOpenBot: (botId: string) => void;
  onOpenTeamProject: (goal: string) => void;
  onOpenApprovals: () => void;
}) {
  const [text, setText] = createSignal("");
  const [jobRole, setJobRole] = createSignal<JobRole | null>(null);
  const [jobId, setJobId] = createSignal<string | null>(null);
  const [chosen, setChosen] = createSignal<string | null>(null);
  const [advice, setAdvice] = createSignal<{ botId: string; why: string } | null>(null);
  const [choosingTrade, setChoosingTrade] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal("");
  const [micRequest, setMicRequest] = createSignal(0);
  const [useCounts, setUseCounts] = createSignal(starterUseCounts());
  let box: HTMLTextAreaElement | undefined;

  const jobs = createMemo(() => starterJobs(trade() ?? "other", language(), useCounts()));

  const fallbackBot = createMemo(() => {
    const byId = (id: string | null) => props.bots.find((bot) => bot.id === id);
    return (
      byId(props.ceoBotId) ?? props.bots.find((bot) => LEAD_ROLE.test(bot.role)) ?? props.bots[0]
    );
  });

  /** Who should do it, from the kind of work the words point to. */
  const byRole = createMemo(() => {
    const role = jobRole() ?? roleFor(text());
    if (!role) return null;
    return props.bots.find((bot) => ROLE_NAMES[role].test(bot.role)) ?? null;
  });

  // The Intelligence Core knows which coworker did this kind of work well before.
  let adviceTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    on(text, (value) => {
      clearTimeout(adviceTimer);
      setAdvice(null);
      const ask = value.trim();
      if (ask.length < 12 || !featureOn("intelligence-core")) return;
      adviceTimer = setTimeout(() => {
        void window.sahkarmi?.intelligence
          ?.recommend?.({ text: ask, defaultBotId: (byRole() ?? fallbackBot())?.id ?? null })
          .then((result) => {
            if (text().trim() !== ask || !result.chosenBotId) return;
            if (result.confidence !== "high" && result.confidence !== "medium") return;
            if (!props.bots.some((bot) => bot.id === result.chosenBotId)) return;
            setAdvice({ botId: result.chosenBotId, why: result.explanation });
          })
          .catch(() => undefined);
      }, 700);
    }),
  );
  onCleanup(() => clearTimeout(adviceTimer));

  const suggested = createMemo(() => {
    const learned = advice();
    const fromAdvice = learned ? props.bots.find((bot) => bot.id === learned.botId) : undefined;
    return fromAdvice ?? byRole() ?? fallbackBot();
  });
  const target = createMemo(
    () => props.bots.find((bot) => bot.id === chosen()) ?? suggested() ?? null,
  );
  const why = createMemo(() => {
    const bot = target();
    if (!bot || chosen()) return "";
    if (advice()?.botId === bot.id) return advice()?.why ?? "";
    if (byRole()?.id === bot.id) return t("homeWhyRole", { role: bot.role });
    return bot.id === props.ceoBotId ? t("homeWhyCeo") : t("homeWhyLead");
  });

  const recent = createMemo(() =>
    [...props.bots]
      .filter((bot) => bot.threadId && bot.preview.trim())
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, 3),
  );

  function pick(job: StarterJob) {
    setText(job.prompt);
    setJobRole(job.role);
    setJobId(job.id);
    setChosen(null);
    box?.focus();
  }

  async function start() {
    const ask = text().trim();
    const bot = target();
    if (!ask || !bot || sending()) return;
    setSending(true);
    setError("");
    try {
      await props.onSend(bot.id, ask);
      const started = jobId();
      if (started) setUseCounts(noteStarterUsed(started));
      setText("");
      setJobRole(null);
      setJobId(null);
      props.onOpenBot(bot.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <section class="home-view" aria-labelledby="home-title">
      <div class="home-column">
        <header class="home-header">
          <h1 id="home-title">{t("homeTitle")}</h1>
          <p>{t("homeSubtitle")}</p>
        </header>

        <Show when={props.pendingApprovals > 0}>
          <button type="button" class="home-needs-you" onClick={props.onOpenApprovals}>
            <span class="home-needs-dot" aria-hidden="true" />
            {props.pendingApprovals === 1
              ? t("homeApprovalOne")
              : t("homeApprovals", { count: String(props.pendingApprovals) })}
            <span class="home-needs-open">{t("homeApprovalsOpen")}</span>
          </button>
        </Show>

        <form
          class="home-ask"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label class="sr-only" for="home-ask-box">
            {t("homeTitle")}
          </label>
          <textarea
            id="home-ask-box"
            ref={box}
            rows={3}
            value={text()}
            placeholder={t("homePlaceholder")}
            onInput={(event) => {
              setText(event.currentTarget.value);
              setJobRole(null);
              setJobId(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void start();
              }
            }}
          />
          <div class="home-ask-bar">
            <div class="home-mic">
              <button
                type="button"
                class="home-mic-button"
                aria-label={t("homeMic")}
                onClick={() => setMicRequest((count) => count + 1)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a6 6 0 0 1-12 0M12 17.5V21m-3.5 0h7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span>{t("homeMic")}</span>
              </button>
              <VoiceRecorder
                startRequest={micRequest()}
                onAttach={(_attachments, transcript) => {
                  if (!transcript.trim()) return;
                  setText(
                    (current) => `${current}${current.trim() ? " " : ""}${transcript.trim()}`,
                  );
                  box?.focus();
                }}
                onError={setError}
              />
            </div>
            <span class="home-ask-spacer" />
            <button
              type="submit"
              class="button-primary home-start"
              disabled={!text().trim() || !target() || sending()}
            >
              {sending() ? t("homeStarting") : t("homeStart")}
            </button>
          </div>
        </form>

        <Show when={error()}>
          <p class="center-view-error" role="alert">
            {error()}
          </p>
        </Show>

        <Show
          when={target()}
          fallback={<p class="home-who home-who-none">{t("homeNoCoworker")}</p>}
        >
          {(bot) => (
            <div class="home-who" role="status">
              <AgentAvatar bot={bot()} />
              <p>
                <strong>
                  {chosen()
                    ? t("homeWillDo", { name: bot().name })
                    : t("homeSuggests", { name: bot().name })}
                </strong>
                <Show when={why()}>
                  <span> {why()}</span>
                </Show>
              </p>
              <Show when={props.bots.length > 1}>
                <label class="home-who-change">
                  <span class="sr-only">{t("homeChange")}</span>
                  <select
                    value={bot().id}
                    onChange={(event) => setChosen(event.currentTarget.value)}
                  >
                    <For each={props.bots}>
                      {(option) => (
                        <option value={option.id}>
                          {option.name}
                          {option.role ? ` · ${option.role}` : ""}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </Show>
            </div>
          )}
        </Show>

        <Show when={looksBig(text())}>
          <div class="home-big" role="status">
            <p>
              <strong>{t("homeBigJob")}</strong> {t("homeBigJobWhy")}
            </p>
            <button type="button" onClick={() => props.onOpenTeamProject(text().trim())}>
              {t("homeBigJobAction")}
            </button>
          </div>
        </Show>

        <section class="home-starters" aria-labelledby="home-starters-title">
          <div class="home-starters-head">
            <h2 id="home-starters-title">
              <Show when={trade()} fallback={t("homeStartersGeneral")}>
                {(chosenTrade) =>
                  t("homeStartersTitle", { trade: tradeName(chosenTrade(), language()) })
                }
              </Show>
            </h2>
            <button
              type="button"
              class="link-button"
              aria-expanded={choosingTrade()}
              onClick={() => setChoosingTrade((open) => !open)}
            >
              {trade() ? t("homeChangeTrade") : t("homeChooseTrade")}
            </button>
          </div>
          <Show when={choosingTrade()}>
            <fieldset class="home-trades">
              <legend class="sr-only">{t("homeChangeTrade")}</legend>
              <For each={TRADES}>
                {(id: TradeId) => (
                  <button
                    type="button"
                    class="chip-button"
                    classList={{ "chip-button-on": (trade() ?? "other") === id }}
                    aria-pressed={(trade() ?? "other") === id}
                    onClick={() => {
                      setTrade(id);
                      setChoosingTrade(false);
                    }}
                  >
                    {tradeName(id, language())}
                  </button>
                )}
              </For>
            </fieldset>
          </Show>
          <ul class="home-starter-grid">
            <For each={jobs()}>
              {(job) => (
                <li>
                  <button
                    type="button"
                    class="home-starter"
                    classList={{ "home-starter-on": jobId() === job.id }}
                    onClick={() => pick(job)}
                  >
                    <span class={`home-starter-mark home-starter-${job.role}`} aria-hidden="true" />
                    <span class="home-starter-title">{job.title}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        <Show when={recent().length > 0}>
          <section class="home-recent" aria-labelledby="home-recent-title">
            <h2 id="home-recent-title">{t("homeRecentTitle")}</h2>
            <ul>
              <For each={recent()}>
                {(bot) => (
                  <li>
                    <button
                      type="button"
                      class="home-recent-row"
                      onClick={() => props.onOpenBot(bot.id)}
                    >
                      <AgentAvatar bot={bot} />
                      <span class="home-recent-text">
                        <strong>{bot.name}</strong>
                        <small>{bot.preview}</small>
                      </span>
                      <span class="home-recent-open">{t("homeRecentOpen")}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </section>
  );
}
