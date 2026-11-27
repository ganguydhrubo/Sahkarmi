import { describe, expect, it } from "vitest";
import { STARTER_NAMES, starterRenames } from "./starter-names";

const team = [
  { id: "mitra-lead", name: "Mitra" },
  { id: "asha-accounts", name: "Asha" },
  { id: "vikram-sales", name: "Vikram" },
  { id: "custom-1", name: "Rohan" },
];

describe("starterRenames", () => {
  it("gives the untouched starter team names from the chosen language", () => {
    expect(starterRenames("de", team)).toEqual([
      { botId: "mitra-lead", name: "Lena" },
      { botId: "asha-accounts", name: "Anna" },
      { botId: "vikram-sales", name: "Felix" },
    ]);
  });

  it("never renames a coworker the owner already renamed or added", () => {
    const renamed = [{ id: "mitra-lead", name: "Boss" }, ...team.slice(1)];
    const result = starterRenames("ja", renamed);
    expect(result.some((rename) => rename.botId === "mitra-lead")).toBe(false);
    expect(result.some((rename) => rename.botId === "custom-1")).toBe(false);
  });

  it("keeps the Indian names for Hindi and Bengali", () => {
    expect(starterRenames("hi", team)).toEqual([]);
    expect(starterRenames("bn", team)).toEqual([]);
  });

  it("has nine names for every language that has a list", () => {
    for (const names of Object.values(STARTER_NAMES)) expect(names).toHaveLength(9);
  });
});
