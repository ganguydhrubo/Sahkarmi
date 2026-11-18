import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotProfile } from "../data";
import { setTrade } from "../preferences";
import { TRADES } from "../trade-names";
import { noteStarterUsed, starterJobs, starterUseCounts } from "../trades";
import { HomeView } from "./HomeView";

// The recorder itself needs a microphone; here a stand-in hands over a finished voice note.
vi.mock("./VoiceRecorder", () => ({
  VoiceRecorder: (props: {
    onAttach: (attachments: Array<{ id: string; name: string }>, transcript: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onAttach([{ id: "draft-1", name: "voice-note.webm" }], "")}
    >
      fake voice note
    </button>
  ),
}));

function bot(id: string, name: string, role: string): BotProfile {
  return {
    id,
    workspaceId: "ws-1",
    name,
    role,
    description: "",
    notifications: true,
    model: "opencode-free",
    reasoningEffort: "medium",
    threadId: null,
    accent: "neutral",
    avatarShape: "blob",
    avatarColor: "orange",
    time: "",
    preview: "",
  } as BotProfile;
}

const TEAM = [
  bot("ops", "Team Operations", "Team · Operations"),
  bot("acc", "Team Accountant", "Team · Accounts"),
  bot("lead", "Team Lead", "Team · Lead"),
];

describe("ready jobs for a line of work", () => {
  beforeEach(() => window.localStorage.clear());

  it("has seven jobs for every trade, with words in English, Hindi and Bengali", () => {
    for (const trade of TRADES) {
      const english = starterJobs(trade, "en");
      const hindi = starterJobs(trade, "hi");
      const bengali = starterJobs(trade, "bn");
      expect(english).toHaveLength(7);
      for (const [index, job] of english.entries()) {
        expect(job.title.length).toBeGreaterThan(3);
        // Every job ends by asking for missing details, so nothing is made up.
        expect(job.prompt).toMatch(/Ask me for any detail you need before you start\.$/);
        expect(hindi[index].title).not.toBe(job.title);
        expect(bengali[index].title).not.toBe(job.title);
        expect(hindi[index].id).toBe(job.id);
      }
      // A language with no words of its own reads English.
      expect(starterJobs(trade, "ta")[0].title).toBe(english[0].title);
    }
  });

  it("puts the jobs the owner uses most first", () => {
    const before = starterJobs("shop", "en").map((job) => job.id);
    noteStarterUsed("shop-stock-list");
    noteStarterUsed("shop-stock-list");
    noteStarterUsed("shop-gst-check");
    const after = starterJobs("shop", "en", starterUseCounts()).map((job) => job.id);
    expect(after.slice(0, 2)).toEqual(["shop-stock-list", "shop-gst-check"]);
    expect([...after].sort()).toEqual([...before].sort());
  });
});

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setTrade("shop");
  });
  afterEach(() => vi.restoreAllMocks());

  function show(overrides: Partial<Parameters<typeof HomeView>[0]> = {}) {
    const onSend = vi.fn();
    const onOpenBot = vi.fn();
    const onOpenTeamProject = vi.fn();
    render(() => (
      <HomeView
        bots={TEAM}
        ceoBotId={null}
        pendingApprovals={0}
        onSend={onSend}
        onOpenBot={onOpenBot}
        onOpenTeamProject={onOpenTeamProject}
        onOpenApprovals={() => undefined}
        {...overrides}
      />
    ));
    return { onSend, onOpenBot, onOpenTeamProject };
  }

  it("fills the box from a ready job, suggests the right coworker and sends on Start", async () => {
    const { onSend, onOpenBot } = show();
    expect(
      screen.getByRole("heading", { name: "What do you want done today?" }),
    ).toBeInTheDocument();
    // Nothing typed: Start is off, and the lead is suggested for jobs with no clear owner.
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByText("Sahkarmi suggests Team Lead.")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Payment reminders" }));
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toContain("payment reminders");
    // "Team · Accounts" is accounts work, whatever the exact role words are.
    expect(screen.getByText("Sahkarmi suggests Team Accountant.")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(onOpenBot).toHaveBeenCalledWith("acc"));
    expect(onSend).toHaveBeenCalledWith("acc", expect.any(String), []);
    expect(onSend.mock.calls[0][1]).toContain("payment reminders");
    // The job is remembered, so it comes first next time.
    expect(starterUseCounts()).toEqual({ "shop-payment-reminder": 1 });
  });

  it("lets the owner choose another coworker, and offers a team for a big job", async () => {
    const { onSend, onOpenTeamProject } = show({ ceoBotId: "ops" });
    // With a CEO, jobs with no clear owner go to the CEO, and Home says why.
    expect(screen.getByText("Sahkarmi suggests Team Operations.")).toBeInTheDocument();
    expect(
      screen.getByText("It is this team's CEO, so it shares the job with the team."),
    ).toBeInTheDocument();

    const box = screen.getByRole("textbox");
    await fireEvent.input(box, {
      target: {
        value:
          "1. Check the stock list\n2. Make the Diwali price list\n3. Write three WhatsApp posts\n4. Plan the delivery days",
      },
    });
    expect(screen.getByText("This looks like a big job.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Give it to a team" }));
    expect(onOpenTeamProject).toHaveBeenCalledWith(expect.stringContaining("Diwali price list"));

    await fireEvent.change(screen.getByRole("combobox"), { target: { value: "lead" } });
    expect(screen.getByText("Team Lead will do this.")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0]).toBe("lead");
  });

  it("keeps a recorded voice note and sends it with the job", async () => {
    const { onSend } = show();
    await fireEvent.click(screen.getByRole("button", { name: "fake voice note" }));
    // The note shows under the box, and Start works even with no typed words.
    expect(screen.getByText("voice-note.webm")).toBeInTheDocument();
    const start = screen.getByRole("button", { name: "Start" });
    expect(start).toBeEnabled();
    await fireEvent.click(start);
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0]).toEqual(["lead", "", ["draft-1"]]);
  });

  it("says when approvals are waiting", () => {
    const onOpenApprovals = vi.fn();
    show({ pendingApprovals: 2, onOpenApprovals });
    fireEvent.click(screen.getByRole("button", { name: /2 approvals are waiting for you/ }));
    expect(onOpenApprovals).toHaveBeenCalled();
  });
});
