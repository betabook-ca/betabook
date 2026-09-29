import { describe, expect, it } from "vitest";

import { profileShareFromPath, profileSharePath, withProfileShare } from "./profile-share";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("profileShareFromPath", () => {
  it("recovers the profile and token from a share link continuation", () => {
    const path = profileSharePath("user-1", TOKEN);
    expect(path).toBe(`/users/user-1?share=${TOKEN}`);
    const share = { userId: "user-1", token: TOKEN };
    expect(profileShareFromPath(path)).toEqual(share);
    expect(profileShareFromPath(`${path}#sends`)).toEqual(share);
    expect(profileShareFromPath(`/users/user-1?tag=trip&share=${TOKEN}`)).toEqual(share);
  });

  it("recovers them from the trips the link opens, which carry the invitation too", () => {
    const share = { userId: "user-1", token: TOKEN };
    for (const path of ["/users/user-1/trips", "/users/user-1/trips/7"]) {
      expect(withProfileShare(path, TOKEN)).toBe(`${path}?share=${TOKEN}`);
      expect(profileShareFromPath(withProfileShare(path, TOKEN))).toEqual(share);
    }
  });

  it("ignores tokens outside the pages the link opens and malformed continuations", () => {
    for (const path of [
      undefined,
      "/users/user-1",
      "/users/user-1?share=invalid",
      `/users/user-1#share=${TOKEN}`,
      `/climbs/1?share=${TOKEN}`,
      `/users/user-1/journal?share=${TOKEN}`,
      `/users/user-1/trips/7/notes?share=${TOKEN}`,
      `/users/user-1/trips/seven?share=${TOKEN}`,
      `/users/?share=${TOKEN}`,
    ]) {
      expect(profileShareFromPath(path)).toBeNull();
    }
  });
});
