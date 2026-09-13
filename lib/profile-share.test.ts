import { describe, expect, it } from "vitest";

import {
  parseProfileShareToken,
  profileSharePath,
  profileShareTokenFromPath,
} from "./profile-share";

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

describe("profileShareTokenFromPath", () => {
  it("recovers the token from a share link continuation", () => {
    const path = profileSharePath("user-1", TOKEN);
    expect(path).toBe(`/users/user-1?share=${TOKEN}`);
    expect(profileShareTokenFromPath(path)).toBe(TOKEN);
    expect(profileShareTokenFromPath(`${path}#sends`)).toBe(TOKEN);
    expect(profileShareTokenFromPath(`/users/user-1?tag=trip&share=${TOKEN}`)).toBe(TOKEN);
  });

  it("finds nothing in plain or malformed continuations", () => {
    expect(profileShareTokenFromPath(undefined)).toBeNull();
    expect(profileShareTokenFromPath("/users/user-1")).toBeNull();
    expect(profileShareTokenFromPath("/users/user-1?share=invalid")).toBeNull();
    expect(profileShareTokenFromPath(`/users/user-1#share=${TOKEN}`)).toBeNull();
  });
});
