import { describe, expect, it } from "vitest";

import { ActionError } from "./action-result";
import { parseProjectShareAudience } from "./privacy";
import {
  describeProjectShare,
  isProjectShareExpired,
  parseProjectShareExpiry,
  parseProjectShareToken,
  projectShareExpiryModifier,
  projectSharePath,
  PROJECT_SHARE_EXPIRIES,
} from "./project-share";

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

describe("tokens", () => {
  it("accepts the shape the database issues and nothing else", () => {
    expect(parseProjectShareToken(TOKEN)).toBe(TOKEN);
    for (const value of [
      TOKEN.toUpperCase(),
      `${TOKEN}0`,
      TOKEN.slice(0, 31),
      "../../users/owner",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(parseProjectShareToken(value)).toBeNull();
    }
  });

  it("builds a path carrying nothing but the token", () => {
    expect(projectSharePath(TOKEN)).toBe(`/projects/${TOKEN}`);
  });
});

describe("audience", () => {
  it("takes the three a link can carry", () => {
    for (const audience of ["friends", "public", "everyone"]) {
      expect(parseProjectShareAudience(audience)).toBe(audience);
    }
  });

  it("refuses Only me, which would be a link nobody can open", () => {
    // parseSendCommentAudience would accept it, and the CHECK constraint would
    // then fail as a generic error instead of a sentence.
    expect(() => parseProjectShareAudience("private")).toThrow(ActionError);
    expect(() => parseProjectShareAudience("nobody")).toThrow(ActionError);
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
    const now = new Date("2026-09-20T12:00:00Z");
    expect(isProjectShareExpired("2026-09-20 11:59:59", now)).toBe(true);
    expect(isProjectShareExpired("2026-09-20 12:00:01", now)).toBe(false);
    expect(isProjectShareExpired(null, now)).toBe(false);
  });
});

describe("description", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("names the audience and how long is left", () => {
    expect(describeProjectShare("friends", "2026-09-27 12:00:00", now)).toBe(
      "Friends · expires in 7 days",
    );
    expect(describeProjectShare("public", "2026-09-21 06:00:00", now)).toBe(
      "Members · expires tomorrow",
    );
    expect(describeProjectShare("everyone", null, now)).toBe("Everyone · no expiry");
  });

  it("says expired rather than counting backwards", () => {
    expect(describeProjectShare("friends", "2026-09-19 12:00:00", now)).toBe("Friends · expired");
  });
});
