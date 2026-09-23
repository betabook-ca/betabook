import { describe, expect, it } from "vitest";

import { ActionError } from "./action-result";
import {
  describeProjectShare,
  isProjectShareExpired,
  parseProjectShareExpiry,
  projectShareExpiryModifier,
  projectSharePath,
  PROJECT_SHARE_EXPIRIES,
} from "./project-share";

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

describe("tokens", () => {
  it("builds a path carrying nothing but the token", () => {
    expect(projectSharePath(TOKEN)).toBe(`/projects/${TOKEN}`);
  });
});

describe("expiry", () => {
  it("maps each option to a SQLite modifier, and never expires to none", () => {
    expect(projectShareExpiryModifier(parseProjectShareExpiry("7d"))).toBe("+7 days");
    expect(projectShareExpiryModifier(parseProjectShareExpiry("30d"))).toBe("+30 days");
    expect(projectShareExpiryModifier(parseProjectShareExpiry("6mo"))).toBe("+6 months");
    expect(projectShareExpiryModifier(parseProjectShareExpiry("never"))).toBeNull();
  });

  it("offers durations that span days, months and indefinite", () => {
    expect(PROJECT_SHARE_EXPIRIES.map((option) => option.value)).toEqual([
      "7d",
      "30d",
      "6mo",
      "never",
    ]);
  });

  it("refuses anything outside the list, so nothing user-supplied reaches SQL", () => {
    for (const value of ["1d", "+7 days", "', 'x'", "", null]) {
      expect(() => parseProjectShareExpiry(value)).toThrow(ActionError);
    }
  });

  it("reads a passed deadline as expired and a future one as live", () => {
    const today = "2026-09-20";
    expect(isProjectShareExpired("2026-09-19 23:59:59", today)).toBe(true);
    expect(isProjectShareExpired("2026-09-21 00:00:01", today)).toBe(false);
    // A link running out later today is still live today.
    expect(isProjectShareExpired("2026-09-20 00:00:01", today)).toBe(false);
    expect(isProjectShareExpired(null, today)).toBe(false);
  });

  it("treats an unknown clock as live, so a server render matches its hydration", () => {
    // The board resolves `today` on the client only; before that the card
    // must not decide expiry, or it renders one way and hydrates another.
    expect(isProjectShareExpired("2020-01-01 00:00:00", null)).toBe(false);
  });
});

describe("description", () => {
  it("prints the date the link runs out, never an audience", () => {
    // A link has no audience to name: holding it is the whole permission.
    expect(describeProjectShare("2026-09-27 12:00:00")).toBe("Link expires Sep 27, 2026");
    expect(describeProjectShare("2027-03-01 00:00:00")).toBe("Link expires Mar 1, 2027");
  });

  it("says so when there is no deadline at all", () => {
    expect(describeProjectShare(null)).toBe("Link never expires");
  });

  it("does not depend on the current time, so a render and its hydration agree", () => {
    // The string is the stored date formatted, with no "now" in it — the
    // reason the countdown it replaced was a hydration hazard.
    const past = describeProjectShare("2020-01-01 12:00:00");
    expect(past).toBe("Link expires Jan 1, 2020");
  });
});
