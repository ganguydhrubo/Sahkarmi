import { describe, expect, it } from "vitest";
import type { QueueSnapshot } from "../../shared/ipc";
import type { BotProfile } from "./data";
import { teamWork } from "./team-work";

const bot = (id: string, name: string) => ({ id, name }) as BotProfile;
const bots = [bot("ceo", "Asha"), bot("acc", "Mitra"), bot("sales", "Rohan")];

function queue(botId: string, sender: QueueSnapshot["deliveries"][number]["sender"]) {
  return {
    botId,
    paused: false,
    deliveries: [{ id: "d1", messageId: "m1", recipientBotId: botId, sender, status: "running" }],
  } as unknown as QueueSnapshot;
}

const base = {
  bots,
  activeTurns: {},
  messages: {},
  planLines: {},
  forTemplate: "{doing} · for {name}",
  now: 1_000,
};

describe("teamWork", () => {
  it("says who gave the job when a coworker gave it", () => {
    const work = teamWork({
      ...base,
      workingBotIds: ["acc"],
      queues: { acc: queue("acc", { kind: "bot", botId: "ceo" }) },
    });
    expect(work.acc.line).toMatch(/ · for Asha$/);
    expect(work.acc.line.length).toBeGreaterThan(" · for Asha".length);
    expect(work.acc.kind).not.toBeNull();
  });

  it("adds no name when the owner gave the job", () => {
    const work = teamWork({
      ...base,
      workingBotIds: ["sales"],
      queues: { sales: queue("sales", { kind: "user" }) },
    });
    expect(work.sales.line).not.toContain("for");
    expect(work.sales.line.length).toBeGreaterThan(0);
  });

  it("uses the coworker's own plan step when there is one", () => {
    const work = teamWork({
      ...base,
      workingBotIds: ["acc"],
      queues: { acc: queue("acc", { kind: "bot", botId: "ceo" }) },
      planLines: { acc: "Step 2 of 4: Checking the GST numbers" },
    });
    expect(work.acc.line).toBe("Step 2 of 4: Checking the GST numbers · for Asha");
  });

  it("lists only coworkers that are working", () => {
    const work = teamWork({ ...base, workingBotIds: [], queues: {} });
    expect(work).toEqual({});
  });
});
