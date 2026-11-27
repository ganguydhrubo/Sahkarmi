import type { QueueSnapshot } from "../../shared/ipc";
import { deriveActivity } from "./activity";
import { primaryLine } from "./components/ActivityIndicator";
import { type WorkKind, workKind } from "./components/WorkBadge";
import type { BotMessage, BotProfile } from "./data";

/** What one working coworker is doing right now, and for whom. */
export interface TeamWork {
  kind: WorkKind;
  /** "Writing the file for Mitra" - from the real activity, never made up. */
  line: string;
}

/**
 * Who is doing what, for every coworker that is working. The words come from the same real
 * events as the activity line in the chat; "for <name>" is the coworker who gave the job
 * (nothing is added when the owner gave it).
 */
export function teamWork(input: {
  bots: BotProfile[];
  workingBotIds: string[];
  queues: Record<string, QueueSnapshot | undefined>;
  activeTurns: Record<string, string | null | undefined>;
  messages: Record<string, BotMessage[] | undefined>;
  /** A coworker's own plan step ("Step 2 of 4: ...") says more than the activity word. */
  planLines: Record<string, string | null | undefined>;
  /** "{doing} for {name}" in the app language. */
  forTemplate: string;
  now: number;
}): Record<string, TeamWork> {
  const names = new Map(input.bots.map((bot) => [bot.id, bot.name]));
  const work: Record<string, TeamWork> = {};
  for (const botId of input.workingBotIds) {
    const queue = input.queues[botId];
    const activity = deriveActivity({
      queue,
      activeTurnId: input.activeTurns[botId] ?? null,
      messages: input.messages[botId] ?? [],
      retry: null,
      waitingForUser: false,
      waitingForApproval: false,
      outcome: null,
      now: input.now,
      sending: false,
    });
    const doing =
      input.planLines[botId] ||
      primaryLine(activity)
        .replace(/[\s.…]+$/u, "")
        .trim();
    const running = queue?.deliveries.find(
      (delivery) => delivery.status === "running" || delivery.status === "starting",
    );
    const giver = running?.sender.kind === "bot" ? names.get(running.sender.botId) : undefined;
    const line =
      doing && giver ? input.forTemplate.replace("{doing}", doing).replace("{name}", giver) : doing;
    work[botId] = { kind: workKind(activity.phase, activity.category) ?? "thinking", line };
  }
  return work;
}
