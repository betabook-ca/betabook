import { describe, expect, it } from "vitest";

import { getGoogleProfileImageUrl, getUserInitials } from "@/lib/user-initials";

describe("getUserInitials", () => {
  it("uses the first and last names", () => {
    expect(getUserInitials("Jasper H. Lin")).toBe("JL");
  });

  it("uses two characters for a single-word name", () => {
    expect(getUserInitials("cher")).toBe("CH");
  });

  it("normalizes whitespace and preserves Unicode characters", () => {
    expect(getUserInitials("  Élodie   王  ")).toBe("É王");
  });

  it("provides a safe fallback for an empty name", () => {
    expect(getUserInitials("   ")).toBe("?");
  });
});

describe("getGoogleProfileImageUrl", () => {
  it("accepts an HTTPS Google profile image", () => {
    expect(getGoogleProfileImageUrl("https://lh3.googleusercontent.com/a/avatar=s96-c")).toBe(
      "https://lh3.googleusercontent.com/a/avatar=s96-c",
    );
  });

  it.each([null, "", "image", "/avatar.png", "http://lh3.googleusercontent.com/a/avatar"])(
    "falls back for an unusable image value: %s",
    (image) => {
      expect(getGoogleProfileImageUrl(image)).toBeNull();
    },
  );

  it("rejects an image from an unconfigured host", () => {
    expect(getGoogleProfileImageUrl("https://example.com/avatar.png")).toBeNull();
  });
});
