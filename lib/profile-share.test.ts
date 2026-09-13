import { describe, expect, it } from "vitest";

import { parseProfileShareToken, profileShareFromPath, profileSharePath } from "./profile-share";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("parseProfileShareToken", () => {
  it("accepts only the issued token format", () => {
    expect(parseProfileShareToken(TOKEN)).toBe(TOKEN);
    for (const value of [
      undefined,
      [TOKEN],
      TOKEN.toUpperCase(),
      `${TOKEN}0`,
      TOKEN.slice(1),
      "../../account",
    ]) {
      expect(parseProfileShareToken(value)).toBeNull();
    }
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
