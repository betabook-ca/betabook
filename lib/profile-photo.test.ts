import { describe, expect, it } from "vitest";

import { hasProfilePhoto, shownProfilePhoto } from "@/lib/profile-photo";

describe("shownProfilePhoto", () => {
  const PHOTO = "https://lh3.googleusercontent.com/a/avatar=s96-c";

  it("returns the stored photo while the setting is on", () => {
    expect(shownProfilePhoto({ image: PHOTO, showProfilePhoto: true })).toBe(PHOTO);
  });

  it("returns null once the climber chose initials", () => {
    expect(shownProfilePhoto({ image: PHOTO, showProfilePhoto: false })).toBeNull();
  });

  it("stays null for an account with no photo either way", () => {
    expect(shownProfilePhoto({ image: null, showProfilePhoto: true })).toBeNull();
    expect(shownProfilePhoto({ image: null, showProfilePhoto: false })).toBeNull();
  });
});

describe("hasProfilePhoto", () => {
  it("offers the setting for a Google photo the app would render", () => {
    expect(hasProfilePhoto("https://lh3.googleusercontent.com/a/avatar=s96-c")).toBe(true);
  });

  // Anything UserAvatar would fall back to initials for makes the switch inert,
  // so Account settings hides it. Mirrors getGoogleProfileImageUrl's guard.
  it.each([null, undefined, "", "avatar", "/avatar.png", "https://example.com/a/avatar"])(
    "withholds the setting for %o",
    (image) => {
      expect(hasProfilePhoto(image)).toBe(false);
    },
  );
});
