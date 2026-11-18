import type {
  AgentModelId,
  AgentReasoningEffort,
  BotSummary,
  OrchestratorSpecialistRole,
  UpdateBotInput,
} from "../shared/ipc";

/** A role in a team run, plus the lead who plans it when the workspace has no CEO. */
export type TeamRole = OrchestratorSpecialistRole | "lead";

export interface TeamMemberRequest {
  role: TeamRole;
  workspaceId: string | null;
  model: AgentModelId | null;
  reasoningEffort: AgentReasoningEffort | null;
}

export interface TeamMemberPort {
  listBots(): BotSummary[];
  createBot(workspaceId?: string): Promise<BotSummary>;
  updateBot(input: UpdateBotInput): Promise<BotSummary>;
}

interface Profile {
  name: string;
  label: string;
  description: string;
}

const PROFILES: Record<TeamRole, Profile> = {
  lead: {
    name: "Team Lead",
    label: "Lead",
    description:
      "Plans team projects: splits the goal into clear tasks, picks who does each one, and checks that the pieces fit.",
  },
  orchestrator: {
    name: "Team Lead",
    label: "Lead",
    description:
      "Plans team projects: splits the goal into clear tasks, picks who does each one, and checks that the pieces fit.",
  },
  architect: {
    name: "Team Planner",
    label: "Planner",
    description: "Works out the approach, the parts and the order of work before anyone builds.",
  },
  code: {
    name: "Team Builder",
    label: "Builder",
    description: "Does the main work of a team task: writes the code, document or file asked for.",
  },
  backend: {
    name: "Team Backend Developer",
    label: "Backend",
    description: "Builds servers, databases, data imports and APIs.",
  },
  frontend: {
    name: "Team Designer",
    label: "Designer",
    description: "Builds screens, pages and visuals that people use.",
  },
  qa: {
    name: "Team Checker",
    label: "Checker",
    description: "Tests and reviews the team's work, and says plainly what fails and why.",
  },
  security: {
    name: "Team Security Reviewer",
    label: "Security",
    description: "Checks the work for security and privacy problems.",
  },
  research: {
    name: "Team Researcher",
    label: "Researcher",
    description: "Finds facts, sources, prices and examples, and says where each came from.",
  },
  finance: {
    name: "Team Accountant",
    label: "Accounts",
    description: "Handles numbers: costs, budgets, invoices and GST.",
  },
  ops: {
    name: "Team Operations",
    label: "Operations",
    description: "Sets things up and keeps them running: files, schedules, mail and tools.",
  },
};

/** The role text that marks a coworker as the team's own member for a role. */
export function teamMarker(role: TeamRole): string {
  return `Team · ${PROFILES[role].label}`;
}

export function isTeamMember(bot: Pick<BotSummary, "role">): boolean {
  return Object.values(PROFILES).some((profile) => bot.role === `Team · ${profile.label}`);
}

/**
 * The team's own coworker for a role: made once per workspace and reused by every later team
 * run, so the coworker list does not fill up. When the owner chose a model for the team, the
 * member moves to it (and its effort); coworkers the owner made are never changed here.
 */
export async function ensureTeamMember(
  port: TeamMemberPort,
  request: TeamMemberRequest,
): Promise<BotSummary> {
  const profile = PROFILES[request.role];
  const marker = teamMarker(request.role);
  let bot =
    port
      .listBots()
      .find(
        (candidate) =>
          candidate.role === marker &&
          (request.workspaceId === null || candidate.workspaceId === request.workspaceId),
      ) ?? null;
  if (!bot) {
    const made = await port.createBot(request.workspaceId ?? undefined);
    bot = await port.updateBot({
      botId: made.id,
      name: profile.name,
      role: marker,
      description: profile.description,
    });
  }
  const model = request.model ?? null;
  const effort = request.reasoningEffort ?? null;
  if ((model && bot.model !== model) || (effort && bot.reasoningEffort !== effort)) {
    bot = await port.updateBot({
      botId: bot.id,
      ...(model ? { model } : {}),
      ...(effort ? { reasoningEffort: effort } : {}),
    });
  }
  return bot;
}
