import { describe, expect, it } from "vitest";
import type { BotSummary, UpdateBotInput } from "../shared/ipc";
import { ensureTeamMember, isTeamMember, type TeamMemberPort, teamMarker } from "./team-members";

function bot(id: string, overrides: Partial<BotSummary> = {}): BotSummary {
  return {
    id,
    workspaceId: "default",
    name: id,
    role: "Coworker",
    description: "",
    notifications: false,
    model: "opencode:free",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: "",
    preview: "",
    updatedAt: null,
    avatarShape: "blob",
    avatarColor: "orange",
    ...overrides,
  };
}

function fakePort(start: BotSummary[] = []) {
  const bots = [...start];
  const updates: UpdateBotInput[] = [];
  const port: TeamMemberPort = {
    listBots: () => bots,
    async createBot(workspaceId) {
      const made = bot(`bot-${bots.length + 1}`, { workspaceId: workspaceId ?? "default" });
      bots.push(made);
      return made;
    },
    async updateBot(input) {
      updates.push(input);
      const index = bots.findIndex((item) => item.id === input.botId);
      const next = { ...bots[index], ...input } as BotSummary;
      bots[index] = next;
      return next;
    },
  };
  return { port, bots, updates };
}

describe("ensureTeamMember", () => {
  it("makes a member once for a role and reuses it on the next run", async () => {
    const { port, bots } = fakePort([bot("priya")]);
    const request = {
      role: "research" as const,
      workspaceId: null,
      model: null,
      reasoningEffort: null,
    };
    const first = await ensureTeamMember(port, request);
    const second = await ensureTeamMember(port, request);
    expect(second.id).toBe(first.id);
    expect(bots).toHaveLength(2);
    expect(first.role).toBe(teamMarker("research"));
    expect(isTeamMember(first)).toBe(true);
    expect(isTeamMember(bots[0] as BotSummary)).toBe(false);
  });

  it("moves a member to the team's model and effort, and never touches the owner's coworkers", async () => {
    const { port, bots, updates } = fakePort([bot("priya")]);
    await ensureTeamMember(port, {
      role: "qa",
      workspaceId: null,
      model: null,
      reasoningEffort: null,
    });
    const moved = await ensureTeamMember(port, {
      role: "qa",
      workspaceId: null,
      model: "claude:sonnet" as BotSummary["model"],
      reasoningEffort: "high",
    });
    expect(moved.model).toBe("claude:sonnet");
    expect(moved.reasoningEffort).toBe("high");
    expect(updates.every((input) => input.botId !== "priya")).toBe(true);
    expect(bots[0]?.model).toBe("opencode:free");
  });

  it("keeps each workspace's team apart", async () => {
    const { port } = fakePort();
    const a = await ensureTeamMember(port, {
      role: "lead",
      workspaceId: "shop",
      model: null,
      reasoningEffort: null,
    });
    const b = await ensureTeamMember(port, {
      role: "lead",
      workspaceId: "school",
      model: null,
      reasoningEffort: null,
    });
    expect(a.id).not.toBe(b.id);
    expect(a.workspaceId).toBe("shop");
  });
});
