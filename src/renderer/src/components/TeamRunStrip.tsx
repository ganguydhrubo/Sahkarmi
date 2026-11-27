import { For, Show } from "solid-js";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import type { TeamWork } from "../team-work";
import { AgentAvatar } from "./AgentAvatar";
import { WorkBadge } from "./WorkBadge";

/**
 * A thin strip on top of the CEO's chat while the team works: who is working and on what.
 * A tap opens that coworker's chat.
 */
export function TeamRunStrip(props: {
  workers: Array<{ bot: BotProfile; work: TeamWork }>;
  onOpenBot: (botId: string) => void;
}) {
  return (
    <Show when={props.workers.length > 0}>
      <section class="team-run-strip" aria-label={t("teamRunTitle")}>
        <span class="team-run-title">{t("teamRunTitle")}</span>
        <For each={props.workers}>
          {(worker) => (
            <button
              type="button"
              class="team-run-worker"
              title={`${worker.bot.name}: ${worker.work.line}`}
              onClick={() => props.onOpenBot(worker.bot.id)}
            >
              <span class="team-run-avatar">
                <AgentAvatar bot={worker.bot} />
                <WorkBadge kind={worker.work.kind} />
              </span>
              <span class="team-run-copy">
                <strong>{worker.bot.name}</strong>
                <small>{worker.work.line}</small>
              </span>
            </button>
          )}
        </For>
      </section>
    </Show>
  );
}
