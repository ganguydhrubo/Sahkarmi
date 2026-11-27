import { beforeEach, describe, expect, it } from "vitest";
import { noteStarterUsed, powerJobs, starterUseCounts } from "./trades";

describe("power jobs on Home", () => {
  beforeEach(() => window.localStorage.clear());

  it("has eight jobs in English, Hindi and Bengali, each asking for missing details", () => {
    const english = powerJobs("en");
    const hindi = powerJobs("hi");
    const bengali = powerJobs("bn");
    expect(english).toHaveLength(8);
    for (const [index, job] of english.entries()) {
      expect(job.prompt).toMatch(/Ask me for any detail you need before you start\.$/);
      expect(["browser", "pc", "files"]).toContain(job.where);
      expect(hindi[index].id).toBe(job.id);
      expect(hindi[index].title).not.toBe(job.title);
      expect(bengali[index].title).not.toBe(job.title);
    }
    // A language with no words of its own reads English.
    expect(powerJobs("de")[0].title).toBe(english[0].title);
  });

  it("never lets a job that sends, posts or moves things finish without the owner", () => {
    const risky = powerJobs("en").filter((job) =>
      ["power-inbox", "power-social", "power-form", "power-files"].includes(job.id),
    );
    expect(risky).toHaveLength(4);
    for (const job of risky) {
      expect(job.prompt).toMatch(/until I say yes|Show me before|show me the|before you move/);
    }
  });

  it("puts the job the owner uses most first", () => {
    noteStarterUsed("power-bills");
    noteStarterUsed("power-bills");
    expect(powerJobs("en", starterUseCounts())[0].id).toBe("power-bills");
  });
});
