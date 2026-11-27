import { createSignal, For, type JSX, Show } from "solid-js";
import { type MessageKey, t } from "../i18n";
import { chooseUsageCount, usageCountChoice } from "../usage-count";
import { LogoMark } from "./Logo";
import { OpenSourceCredits } from "./OpenSourceCredits";

const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/dhrubojyoti-gangopadhyay";
const FOUNDER_TELEGRAM = "https://t.me/dhruboG";
const FOUNDER_EMAIL = "gangulydhrubo@gmail.com";

interface LinkItem {
  id: string;
  href: string;
  label: string | MessageKey;
  translated?: boolean;
  detail?: string;
  icon: () => JSX.Element;
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.4 11.6c-1-.3-1.1-1 .2-1.5L20.5 2.8c.9-.3 1.7.2 1.4 1.5z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const CONTACT: LinkItem[] = [
  {
    id: "linkedin",
    href: FOUNDER_LINKEDIN,
    label: "LinkedIn",
    detail: "Dhrubojyoti Gangopadhyay",
    icon: LinkedInIcon,
  },
  {
    id: "telegram",
    href: FOUNDER_TELEGRAM,
    label: "Telegram",
    detail: "@dhruboG",
    icon: TelegramIcon,
  },
  {
    id: "email",
    href: `mailto:${FOUNDER_EMAIL}`,
    label: "aboutEmail",
    translated: true,
    detail: FOUNDER_EMAIL,
    icon: MailIcon,
  },
];

const FOLLOW: LinkItem[] = [
  { id: "site", href: "https://sahkarmi.site", label: "sahkarmi.site", icon: GlobeIcon },
  {
    id: "linkedin",
    href: "https://www.linkedin.com/company/sahkarmi/",
    label: "LinkedIn",
    icon: LinkedInIcon,
  },
  {
    id: "facebook",
    href: "https://www.facebook.com/sahakarmi",
    label: "Facebook",
    icon: FacebookIcon,
  },
  {
    id: "instagram",
    href: "https://www.instagram.com/sahkarmiai",
    label: "Instagram",
    icon: InstagramIcon,
  },
];

function open(href: string) {
  void window.sahkarmi.openUrl(href).catch(() => undefined);
}

const label = (item: LinkItem) =>
  item.translated ? t(item.label as MessageKey) : (item.label as string);

/** The anonymous daily user number; hidden in copies that never count. */
function UsageCountSwitch() {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show when={usageCountChoice() !== null}>
      <label class="about-usage">
        <input
          type="checkbox"
          checked={usageCountChoice() === "on"}
          onChange={(event) => {
            const input = event.currentTarget;
            const next = input.checked;
            setFailed(false);
            chooseUsageCount(next).catch(() => {
              input.checked = !next;
              setFailed(true);
            });
          }}
        />
        <span>
          <strong>{t("usageCountLabel")}</strong>
          <span class="settings-meta">{t("usageCountHelp")}</span>
          <Show when={failed()}>
            <span class="settings-meta" role="alert">
              {t("usageCountSaveFailed")}
            </span>
          </Show>
        </span>
      </label>
    </Show>
  );
}

/** "Your AI team" in every language the app speaks - the About strip scrolls through them. */
const WORLD_LINES: Array<{ lang: string; tag: string; text: string; rtl?: boolean }> = [
  { lang: "en", tag: "EN", text: "Your AI team" },
  { lang: "es", tag: "ES", text: "Tu equipo de IA" },
  { lang: "fr", tag: "FR", text: "Votre équipe IA" },
  { lang: "de", tag: "DE", text: "Dein KI-Team" },
  { lang: "ar", tag: "AR", text: "فريقك للذكاء الاصطناعي", rtl: true },
  { lang: "hi", tag: "HI", text: "आपकी AI टीम" },
  { lang: "bn", tag: "BN", text: "আপনার AI টিম" },
  { lang: "ja", tag: "JA", text: "あなたのAIチーム" },
  { lang: "zh", tag: "ZH", text: "你的 AI 团队" },
  { lang: "ko", tag: "KO", text: "당신의 AI 팀" },
  { lang: "pt", tag: "PT", text: "Sua equipe de IA" },
  { lang: "it", tag: "IT", text: "Il tuo team di IA" },
  { lang: "ru", tag: "RU", text: "Ваша команда ИИ" },
  { lang: "tr", tag: "TR", text: "Yapay zekâ ekibiniz" },
  { lang: "nl", tag: "NL", text: "Jouw AI-team" },
  { lang: "pl", tag: "PL", text: "Twój zespół AI" },
  { lang: "he", tag: "HE", text: "צוות ה-AI שלך", rtl: true },
];

/** Settings > About: the app, its founder and where to find Sahkarmi. */
export function AboutCard(props: { version: string | null }) {
  return (
    <section class="settings-card settings-about about-card">
      <div class="about-hero about-rise" style="--rise: 0">
        <span class="about-glow" aria-hidden="true" />
        <LogoMark size={52} motion="turn" />
        <div class="about-hero-text">
          <strong>
            Sahkarmi <small class="about-hero-sub">(Coworkers)</small>
          </strong>
          <span class="about-version">v{props.version ?? "—"}</span>
          <span class="about-tagline">{t("aboutTagline")}</span>
        </div>
      </div>

      <div class="about-founder about-rise" style="--rise: 1">
        <button
          type="button"
          class="about-btn about-avatar"
          aria-label="Dhrubo on LinkedIn"
          title="LinkedIn"
          onClick={() => open(FOUNDER_LINKEDIN)}
        >
          <span class="about-avatar-ring" aria-hidden="true" />
          <span class="about-avatar-face">
            <span class="about-avatar-letter">D</span>
          </span>
          <span class="about-avatar-badge">
            <LinkedInIcon />
          </span>
        </button>
        <div class="about-founder-text">
          <span class="about-eyebrow">{t("aboutFounder")}</span>
          <strong class="about-name">Dhrubo</strong>
          <span class="about-fullname">Dhrubojyoti Gangopadhyay</span>
          <p class="about-quote">{t("aboutFounderLine")}</p>
        </div>
      </div>

      <div class="about-rise" style="--rise: 2">
        <h3 class="about-heading">{t("aboutContact")}</h3>
        <div class="about-contact">
          <For each={CONTACT}>
            {(item) => (
              <button
                type="button"
                class={`about-btn about-chip about-chip-${item.id}`}
                onClick={() => open(item.href)}
              >
                <span class="about-chip-logo">{item.icon()}</span>
                <span class="about-chip-text">
                  <strong>{label(item)}</strong>
                  <span>{item.detail}</span>
                </span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="about-rise" style="--rise: 3">
        <h3 class="about-heading">{t("aboutFollow")}</h3>
        <div class="about-follow">
          <For each={FOLLOW}>
            {(item) => (
              <button
                type="button"
                class={`about-btn about-social about-social-${item.id}`}
                aria-label={label(item)}
                title={item.href}
                onClick={() => open(item.href)}
              >
                <span class="about-chip-logo">{item.icon()}</span>
                <span>{label(item)}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="about-rise" style="--rise: 4">
        <div class="about-world">
          <div class="about-world-head">
            <span class="about-world-globe" aria-hidden="true">
              🌍
            </span>
            <strong>{t("aboutWorldTitle")}</strong>
            <span class="about-world-made">
              <span class="about-world-dot" aria-hidden="true" />
              Made in India
            </span>
          </div>
          <div class="about-world-track">
            <ul class="about-world-row">
              <For each={[...WORLD_LINES, ...WORLD_LINES]}>
                {(line, i) => (
                  <li
                    lang={line.lang}
                    dir={line.rtl ? "rtl" : "ltr"}
                    aria-hidden={i() >= WORLD_LINES.length ? "true" : undefined}
                  >
                    <span class="about-world-tag">{line.tag}</span>
                    {line.text}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </div>
        <p>{t("aboutBody")}</p>
        <UsageCountSwitch />
        <OpenSourceCredits />
        <p class="settings-meta">{t("attribution")}</p>
      </div>
    </section>
  );
}
