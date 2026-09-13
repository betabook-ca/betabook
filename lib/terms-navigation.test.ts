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
    "/accept-terms",
    "/forgot-password",
    "/reset-password",
  ])
    expect(isTermsExemptPath(path)).toBe(true);
  for (const path of ["/account", "/account/import", "/friends", "/users/one", "/terms-other"])
    expect(isTermsExemptPath(path)).toBe(false);
});
