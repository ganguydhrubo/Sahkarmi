import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "", on: () => undefined },
  clipboard: {},
  desktopCapturer: {},
  session: {},
  WebContentsView: class {},
  webContents: {},
}));

const { keptSessionCookie, sharesSignIn, stillCurrent } = await import("./browser-host");

describe("keeping sign-ins", () => {
  it("treats Facebook, Instagram and their sister sites as one sign-in", () => {
    expect(sharesSignIn("facebook.com", "instagram.com")).toBe(true);
    expect(sharesSignIn("instagram.com", "facebook.com")).toBe(true);
    expect(sharesSignIn("facebook.com", "facebook.com")).toBe(true);
    expect(sharesSignIn("google.com", "youtube.com")).toBe(true);
    // An unrelated site's cookies are not kept just because some page is open.
    expect(sharesSignIn("doubleclick.net", "instagram.com")).toBe(false);
    expect(sharesSignIn("facebook.com", "google.com")).toBe(false);
    expect(sharesSignIn("facebook.com", null)).toBe(false);
    expect(sharesSignIn("", "facebook.com")).toBe(false);
  });

  it("keeps a cookie only while it is still the same one in the browser", () => {
    const noted = { name: "sessionid", value: "account-A", domain: ".instagram.com", path: "/" };
    expect(stillCurrent(noted, [{ ...noted, session: true }])).toBe(true);
    // The owner switched account in between: the old value must not be written back.
    expect(stillCurrent(noted, [{ ...noted, value: "account-B", session: true }])).toBe(false);
    // The site signed out in between.
    expect(stillCurrent(noted, [])).toBe(false);
    // The site made it a lasting cookie itself: nothing to do.
    expect(stillCurrent(noted, [{ ...noted, session: false }])).toBe(false);
  });

  it("stores a session cookie with an expiry and leaves lasting ones alone", () => {
    const kept = keptSessionCookie(
      {
        name: "c_user",
        value: "1",
        domain: ".facebook.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: true,
        session: true,
        sameSite: "no_restriction",
      },
      1_000_000,
    );
    expect(kept).toMatchObject({
      url: "https://facebook.com/",
      name: "c_user",
      domain: ".facebook.com",
    });
    expect(kept?.expirationDate).toBeGreaterThan(1_000);
    expect(
      keptSessionCookie(
        {
          name: "x",
          value: "1",
          domain: ".facebook.com",
          hostOnly: false,
          path: "/",
          secure: true,
          httpOnly: false,
          session: false,
          sameSite: "lax",
        },
        1_000_000,
      ),
    ).toBeNull();
  });
});
