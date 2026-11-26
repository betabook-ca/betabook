import { describe, expect, it } from "vitest";

import { formatAuthErrorMessage, safeNextPath, signInUrl, signUpUrl } from "./sign-in-redirect";

describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/account/import")).toBe("/account/import");
    expect(safeNextPath("/climbs/new")).toBe("/climbs/new");
    expect(safeNextPath("/areas/12?sort=grade&dir=desc")).toBe("/areas/12?sort=grade&dir=desc");
  });

  it("rejects absolute URLs", () => {
    expect(safeNextPath("https://evil.com")).toBeUndefined();
    expect(safeNextPath("http://evil.com/account")).toBeUndefined();
    expect(safeNextPath("javascript:alert(1)")).toBeUndefined();
  });

  it("rejects protocol-relative URLs and backslash variants", () => {
    expect(safeNextPath("//evil.com")).toBeUndefined();
    expect(safeNextPath("//evil.com/account")).toBeUndefined();
    expect(safeNextPath("/\\evil.com")).toBeUndefined();
    expect(safeNextPath("/\\/evil.com")).toBeUndefined();
  });

  it("rejects values with control characters that URL parsers strip", () => {
    // new URL("/\t/evil.com", base) strips the tab, yielding //evil.com.
    expect(safeNextPath("/\t/evil.com")).toBeUndefined();
    expect(safeNextPath("/\n/evil.com")).toBeUndefined();
    expect(safeNextPath("/\r/evil.com")).toBeUndefined();
  });

  it("rejects non-strings and non-path strings", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(["/account", "/other"])).toBeUndefined();
    expect(safeNextPath("")).toBeUndefined();
    expect(safeNextPath("account")).toBeUndefined();
    expect(safeNextPath("evil.com/account")).toBeUndefined();
  });
});

describe("signInUrl / signUpUrl", () => {
  it("returns the bare route without a continuation", () => {
    expect(signInUrl()).toBe("/sign-in");
    expect(signUpUrl()).toBe("/sign-up");
  });

  it("encodes the continuation into the next param", () => {
    expect(signInUrl("/account/import")).toBe("/sign-in?next=%2Faccount%2Fimport");
    expect(signUpUrl("/climbs/new")).toBe("/sign-up?next=%2Fclimbs%2Fnew");
    expect(signInUrl("/areas/12?sort=grade&dir=desc")).toBe(
      "/sign-in?next=%2Fareas%2F12%3Fsort%3Dgrade%26dir%3Ddesc",
    );
  });
});

describe("formatAuthErrorMessage", () => {
  it("formats access_denied to a user cancellation message", () => {
    expect(formatAuthErrorMessage("access_denied")).toBe("Google sign-in was cancelled.");
    expect(formatAuthErrorMessage("ACCESS_DENIED")).toBe("Google sign-in was cancelled.");
  });

  it("formats account linking errors", () => {
    expect(formatAuthErrorMessage("account_not_linked")).toBe(
      "Unable to link your Google account. An unverified account with this email already exists. Please verify your email first or sign in with your password.",
    );
    expect(formatAuthErrorMessage("unable_to_link_account")).toBe(
      "Unable to link your Google account. An unverified account with this email already exists. Please verify your email first or sign in with your password.",
    );
    expect(formatAuthErrorMessage("email_doesn't_match")).toBe(
      "The Google account email does not match your existing account email.",
    );
  });

  it("falls back to generic message for unknown errors", () => {
    expect(formatAuthErrorMessage("unknown_error")).toBe(
      "Sign in with Google failed. Please try again or use your password.",
    );
  });

  it("returns undefined for nullish or invalid values", () => {
    expect(formatAuthErrorMessage(undefined)).toBeUndefined();
    expect(formatAuthErrorMessage("")).toBeUndefined();
    expect(formatAuthErrorMessage(["error1", "error2"])).toBeUndefined();
  });
});
