import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import type { DraftAttachment } from "../../../shared/ipc";
import { looksBig } from "../big-job";
import type { BotProfile } from "../data";
import { featureOn } from "../features";
import { t } from "../i18n";
import { language, setTrade, trade } from "../preferences";
import { TRADES, type TradeId, tradeName } from "../trade-names";
import {
  firstJobDone,
  type JobRole,
  markFirstJobDone,
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
  onSend: (
    botId: string,
    text: string,
    attachmentDraftIds: string[],
    /** Words the owner typed or spoke (not an untouched ready job): the AI reads them first. */
    options?: { understandFirst: boolean },
  ) => void | Promise<void>;
  onOpenBot: (botId: string) => void;
  onOpenTeamProject: (goal: string) => void;
  /** Starts a team project with this goal at once (feature "auto-team"). */
  onStartTeam?: (goal: string) => void | Promise<void>;
  onOpenApprovals: () => void;
}) {
  const [text, setText] = createSignal("");
  /** Voice notes (and any other files) recorded here; they go with the job when it starts. */
  const [files, setFiles] = createSignal<DraftAttachment[]>([]);
  const [jobRole, setJobRole] = createSignal<JobRole | null>(null);
  const [jobId, setJobId] = createSignal<string | null>(null);
  const [chosen, setChosen] = createSignal<string | null>(null);
  const [advice, setAdvice] = createSignal<{ botId: string; why: string } | null>(null);
  const [choosingTrade, setChoosingTrade] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  /**
   * The first job, done together: shown until the owner has started one job from Home, and
   * only while no coworker has worked yet (an owner with chats already knows the way).
   */
  const [firstDone, setFirstDone] = createSignal(firstJobDone());
  const guiding = () =>
    !firstDone() && props.bots.length > 0 && !props.bots.some((bot) => bot.threadId);
  const guideStep = () => (text().trim() ? 3 : 1);
  /** The owner said "use one coworker" for the big job in the box. */
  const [oneOnly, setOneOnly] = createSignal(false);
  /**
   * A big job goes to a team by itself, unless the owner chose a coworker, asked for one
   * coworker, or attached a voice note (a team project takes words only).
   */
  const autoTeam = () =>
    featureOn("auto-team") &&
    Boolean(props.onStartTeam) &&
    looksBig(text()) &&
    files().length === 0 &&
    !oneOnly() &&
    !chosen();
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
    const lead = bot.id === props.ceoBotId ? t("homeWhyCeo") : t("homeWhyLead");
    // Words the rules could not place: the coworker's AI reads them and decides.
    return text().trim() && !jobId() ? `${lead} ${t("homeAiReads")}` : lead;
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
    if (autoTeam()) {
      if (sending()) return;
      setSending(true);
      setError("");
      try {
        await props.onStartTeam?.(ask);
        setText("");
        setJobRole(null);
        setJobId(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSending(false);
      }
      return;
    }
    if ((!ask && files().length === 0) || !bot || sending()) return;
    setSending(true);
    setError("");
    try {
      await props.onSend(
        bot.id,
        ask,
        files().map((file) => file.id),
        { understandFirst: Boolean(ask) && !jobId() },
      );
      setFiles([]);
      const started = jobId();
      if (started) setUseCounts(noteStarterUsed(started));
      markFirstJobDone();
      setFirstDone(true);
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

        <Show when={guiding()}>
          <section class="home-guide" aria-label={t("guideTitle")}>
            <strong>{t("guideTitle")}</strong>
            <ol>
              <li classList={{ "home-guide-done": guideStep() > 1 }}>{t("guideStep1")}</li>
              <li classList={{ "home-guide-now": guideStep() === 3 }}>{t("guideStep2")}</li>
              <li classList={{ "home-guide-now": guideStep() === 3 }}>{t("guideStep3")}</li>
            </ol>
            <Show when={guideStep() === 1 && jobs()[0]}>
              {(job) => (
                <button type="button" class="home-guide-try" onClick={() => pick(job())}>
                  {t("guideTry", { job: job().title })}
                </button>
              )}
            </Show>
          </section>
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
              if (!event.currentTarget.value.trim()) setOneOnly(false);
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
          <Show when={files().length > 0}>
            <ul class="home-files">
              <For each={files()}>
                {(file) => (
                  <li class="home-file">
                    <span class="home-file-name">{file.name}</span>
                    <button
                      type="button"
                      class="home-file-remove"
                      aria-label={t("homeRemoveFile", { name: file.name })}
                      onClick={() => {
                        setFiles((current) => current.filter((item) => item.id !== file.id));
                        void window.sahkarmi?.agent
                          ?.discardDraftAttachment?.(file.id)
                          ?.catch(() => undefined);
                      }}
                    >
                      ×
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
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
                onAttach={(attachments, transcript) => {
                  // A voice note is a file: keep it, or the recording is lost.
                  if (attachments.length > 0) setFiles((current) => [...current, ...attachments]);
                  if (transcript.trim()) {
                    setText(
                      (current) => `${current}${current.trim() ? " " : ""}${transcript.trim()}`,
                    );
                  }
                  box?.focus();
                }}
                onError={setError}
              />
            </div>
            <span class="home-ask-spacer" />
            <button
              type="submit"
              class="button-primary home-start"
              disabled={(!text().trim() && files().length === 0) || !target() || sending()}
            >
              {sending() ? t("homeStarting") : autoTeam() ? t("homeStartTeam") : t("homeStart")}
            </button>
          </div>
        </form>

        <Show when={error()}>
          <p class="center-view-error" role="alert">
            {error()}
          </p>
        </Show>

        <Show
          when={autoTeam() ? null : target()}
          fallback={
            <Show when={!autoTeam()}>
              <p class="home-who home-who-none">{t("homeNoCoworker")}</p>
            </Show>
          }
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
            <Show
              when={autoTeam()}
              fallback={
                <>
                  <p>
                    <strong>{t("homeBigJob")}</strong> {t("homeBigJobWhy")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (featureOn("auto-team") && props.onStartTeam && files().length === 0) {
                        setOneOnly(false);
                        setChosen(null);
                      } else {
                        props.onOpenTeamProject(text().trim());
                      }
                    }}
                  >
                    {t("homeBigJobAction")}
                  </button>
                </>
              }
            >
              <p>
                <strong>{t("homeBigAuto")}</strong> {t("homeBigJobWhy")}
              </p>
              <button type="button" onClick={() => setOneOnly(true)}>
                {t("homeBigOne")}
              </button>
            </Show>
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
