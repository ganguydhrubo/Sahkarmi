import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { looksBig, wantsOneCoworker } from "../big-job";
import type { BotProfile } from "../data";
import { applyFeatures } from "../features";
import { setHomeReader, setTrade } from "../preferences";
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
      expect(starterJobs(trade, "de")[0].title).toBe(english[0].title);
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
    expect(onSend).toHaveBeenCalledWith("acc", expect.any(String), [], {
      understandFirst: false,
    });
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
    // Typed words, not a ready job: the coworker's AI reads them first.
    expect(onSend.mock.calls[0][3]).toEqual({ understandFirst: true });
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
    expect(onSend.mock.calls[0]).toEqual(["lead", "", ["draft-1"], { understandFirst: false }]);
  });

  it("sends a big job to a team by itself when that is switched on, unless the owner says no", async () => {
    applyFeatures([{ id: "auto-team", enabled: true }] as never);
    const onStartTeam = vi.fn();
    const { onSend } = show({ onStartTeam });
    const big =
      "1. Check the stock list\n2. Make the Diwali price list\n3. Write three WhatsApp posts\n4. Plan the delivery days";
    await fireEvent.input(screen.getByRole("textbox"), { target: { value: big } });
    expect(
      screen.getByText("This looks like a big job, so a team will do it."),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Start with a team" }));
    await waitFor(() => expect(onStartTeam).toHaveBeenCalledWith(big));
    expect(onSend).not.toHaveBeenCalled();

    // "Use one coworker instead": the same big job goes to one coworker.
    await fireEvent.input(screen.getByRole("textbox"), { target: { value: big } });
    await fireEvent.click(screen.getByRole("button", { name: "Use one coworker instead" }));
    await fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onStartTeam).toHaveBeenCalledTimes(1);
    applyFeatures([]);
  });

  it("knows a big job from a small one, and the words that keep it with one coworker", () => {
    expect(looksBig("Write a Diwali post")).toBe(false);
    expect(looksBig("Check stock; make the list; write the post; plan delivery")).toBe(true);
    expect(looksBig("word ".repeat(80))).toBe(true);
    expect(wantsOneCoworker("Only you: check stock; make the list")).toBe(true);
    expect(wantsOneCoworker("শুধু তুমি এই কাজটি করো")).toBe(true);
    expect(wantsOneCoworker("Please check stock")).toBe(false);
  });

  it("guides the first job, and stops once a job has been started from Home", async () => {
    const first = show();
    expect(screen.getByText("Your first job, in three steps")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /^Try it with: / }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value.length).toBeGreaterThan(10);
    await fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(first.onSend).toHaveBeenCalled());
    expect(screen.queryByText("Your first job, in three steps")).not.toBeInTheDocument();
  });

  it("shows no guide to an owner whose coworkers have already worked", () => {
    show({ bots: TEAM.map((item) => ({ ...item, threadId: "thread-1" })) });
    expect(screen.queryByText("Your first job, in three steps")).not.toBeInTheDocument();
  });

  it("says when approvals are waiting", () => {
    const onOpenApprovals = vi.fn();
    show({ pendingApprovals: 2, onOpenApprovals });
    fireEvent.click(screen.getByRole("button", { name: /2 approvals are waiting for you/ }));
    expect(onOpenApprovals).toHaveBeenCalled();
  });

  describe("AI preview before Start", () => {
    const bridge = window as unknown as { sahkarmi?: unknown };
    afterEach(() => {
      bridge.sahkarmi = undefined;
    });

    it("shows what the AI understood, who will do it and its questions", async () => {
      const understand = vi.fn(async () => ({
        understood: "Make a GST invoice for Sharma Traders.",
        coworkerIds: ["acc"],
        why: "The accountant makes invoices.",
        questions: ["Which items and amounts?"],
        plan: [],
      }));
      bridge.sahkarmi = { home: { understand } };
      const { onSend } = show({ busyBotIds: ["ops"] });
      const box = screen.getByRole("textbox") as HTMLTextAreaElement;
      await fireEvent.input(box, { target: { value: "sharma traders ka kaam kar do" } });
      // Until the AI answers, the lead is suggested as before.
      expect(screen.getByText("Sahkarmi suggests Team Lead.")).toBeInTheDocument();
      await waitFor(
        () =>
          expect(screen.getByText("Make a GST invoice for Sharma Traders.")).toBeInTheDocument(),
        { timeout: 3000 },
      );
      expect(screen.getByText("Sahkarmi suggests Team Accountant.")).toBeInTheDocument();
      expect(screen.getByText("The accountant makes invoices.")).toBeInTheDocument();
      expect(understand).toHaveBeenCalledWith({
        text: "sharma traders ka kaam kar do",
        language: "English",
        team: [
          { id: "ops", name: "Team Operations", role: "Team · Operations", busy: true },
          { id: "acc", name: "Team Accountant", role: "Team · Accounts", busy: false },
          { id: "lead", name: "Team Lead", role: "Team · Lead", busy: false },
        ],
      });

      // A tapped question goes into the box for the owner to answer.
      await fireEvent.click(screen.getByRole("button", { name: "Which items and amounts?" }));
      expect(box.value).toBe("sharma traders ka kaam kar do\nWhich items and amounts? ");
      expect(screen.queryByRole("button", { name: "Which items and amounts?" })).toBeNull();

      await fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await waitFor(() => expect(onSend).toHaveBeenCalled());
      expect(onSend.mock.calls[0][0]).toBe("acc");
    });

    it("never makes Start wait: it works while the AI is still reading, and when it fails", async () => {
      const understand = vi.fn(() => new Promise<null>(() => undefined));
      bridge.sahkarmi = { home: { understand } };
      const { onSend } = show();
      await fireEvent.input(screen.getByRole("textbox"), {
        target: { value: "make a GST invoice for Sharma Traders" },
      });
      await waitFor(() => expect(understand).toHaveBeenCalled(), { timeout: 3000 });
      expect(screen.getByText("Reading your words…")).toBeInTheDocument();
      const start = screen.getByRole("button", { name: "Start" });
      expect(start).toBeEnabled();
      await fireEvent.click(start);
      await waitFor(() => expect(onSend).toHaveBeenCalled());
      // The keyword pick still chose the accountant.
      expect(onSend.mock.calls[0][0]).toBe("acc");
      expect(onSend.mock.calls[0][3]).toEqual({ understandFirst: true });
    });

    it("stays quiet when the owner switched the free AI reader off", async () => {
      const understand = vi.fn(async () => null);
      bridge.sahkarmi = { home: { understand } };
      setHomeReader("coworker");
      show();
      await fireEvent.input(screen.getByRole("textbox"), {
        target: { value: "make a GST invoice for Sharma Traders" },
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(understand).not.toHaveBeenCalled();
      setHomeReader("free");
    });
  });
});
