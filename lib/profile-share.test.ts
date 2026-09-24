import { describe, expect, it } from "vitest";

import {
  parseProfileShareShortToken,
  profileShareFromPath,
  profileSharePath,
  profileShareShortPath,
} from "./profile-share";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("compact profile share links", () => {
  it("represents the same 16-byte token in a shorter URL-safe path", () => {
    expect(profileShareShortPath(TOKEN)).toBe("/s/ASNFZ4mrze8BI0VniavN7w");
    expect(parseProfileShareShortToken("ASNFZ4mrze8BI0VniavN7w")).toBe(TOKEN);
  });

  it("rejects malformed and noncanonical compact tokens", () => {
    for (const value of [undefined, "not-a-token", "ASNFZ4mrze8BI0VniavN7x", "../account"]) {
      expect(parseProfileShareShortToken(value)).toBeNull();
    }
    expect(() => profileShareShortPath("not-a-token")).toThrow("Invalid profile share token");
  });
});

describe("profileShareFromPath", () => {
  it("recovers the profile and token from a share link continuation", () => {
    const path = profileSharePath("user-1", TOKEN);
    expect(path).toBe(`/users/user-1?share=${TOKEN}`);
    const share = { userId: "user-1", token: TOKEN };
    expect(profileShareFromPath(path)).toEqual(share);
    expect(profileShareFromPath(`${path}#sends`)).toEqual(share);
    expect(profileShareFromPath(`/users/user-1?tag=trip&share=${TOKEN}`)).toEqual(share);
  });

  it("ignores tokens outside a profile's own path and malformed continuations", () => {
    for (const path of [
      undefined,
      "/users/user-1",
      "/users/user-1?share=invalid",
      `/users/user-1#share=${TOKEN}`,
      `/climbs/1?share=${TOKEN}`,
      `/users/user-1/journal?share=${TOKEN}`,
      `/users/?share=${TOKEN}`,
    ]) {
      expect(profileShareFromPath(path)).toBeNull();
    }
  });
});
