import { expect, it } from "vitest";

import { acceptTermsUrl, isTermsExemptPath, termsNextPath } from "./terms-navigation";

it("preserves local destinations and filters while rejecting redirects and loops", () => {
  expect(acceptTermsUrl("/friends?view=requests")).toBe(
    "/accept-terms?next=%2Ffriends%3Fview%3Drequests",
  );
  for (const path of [
    undefined,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/accept-terms?next=/account",
    "/sign-in",
    "/sign-up",
  ]) {
    expect(termsNextPath(path)).toBe("/account");
  }
});

it("keeps terms, public pages, recovery, and acceptance reachable but protects account features", () => {
  for (const path of [
    "/terms",
    "/terms/2026-09-09",
    "/about",
    "/contact",
    "/climbing-logbook",
    "/kaya-import",
    "/sendage-import",
    "/mountain-project-import",
    "/costs",
    "/accept-terms",
    "/forgot-password",
    "/reset-password",
    // Someone else's shared project, which the page authorizes itself.
    "/projects/4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  ])
    expect(isTermsExemptPath(path)).toBe(true);
  for (const path of [
    "/account",
    "/account/import",
    "/friends",
    "/users/one",
    "/terms-other",
    // The owner's own Projects board is member content, unlike a share link.
    "/users/one/projects",
    "/projects",
  ])
    expect(isTermsExemptPath(path)).toBe(false);
});
