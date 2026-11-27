import { afterEach, describe, expect, it } from "vitest";
import {
  activityStyle,
  activityStyleChoice,
  language,
  SUPPORTED_LANGUAGES,
  setActivityStyle,
  setLanguage,
} from "./preferences";

afterEach(() => {
  setLanguage("en");
  setActivityStyle("auto");
});

describe("reading direction", () => {
  it("turns the page right to left for Arabic and Hebrew only", () => {
    setLanguage("ar");
    expect(document.documentElement.dir).toBe("rtl");
    setLanguage("he");
    expect(document.documentElement.dir).toBe("rtl");
    setLanguage("ja");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("forgets a removed language and opens in English", () => {
    window.localStorage.setItem("sahkarmi:language", "ta");
    expect(SUPPORTED_LANGUAGES).not.toContain("ta");
    expect(SUPPORTED_LANGUAGES).toEqual(expect.arrayContaining(["en", "hi", "bn", "zh", "ar"]));
  });
});

describe("status line style", () => {
  it("follows the app language when nothing is chosen: Hinglish only for Hindi", () => {
    setActivityStyle("auto");
    setLanguage("en");
    expect(activityStyle()).toBe("english");
    setLanguage("hi");
    expect(activityStyle()).toBe("seedha");
    setLanguage("bn");
    expect(activityStyle()).toBe("english");
    setLanguage("de");
    expect(activityStyle()).toBe("english");
  });

  it("keeps an owner's own choice until the app language changes", () => {
    setLanguage("hi");
    setActivityStyle("masti");
    expect(activityStyle()).toBe("masti");
    setLanguage("en");
    expect(language()).toBe("en");
    expect(activityStyleChoice()).toBe("auto");
    expect(activityStyle()).toBe("english");
  });
});
