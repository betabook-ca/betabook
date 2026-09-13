import { TERMS_REQUIRED_MESSAGE } from "@/lib/terms";

/**
 * Helpers for the `?next=` continuation param on /sign-in and /sign-up.
 *
 * Authentication callouts link signed-out users to
 * `/sign-in?next=<destination>`; on a successful sign-in the form
 * returns them to that destination instead of unconditionally to /account.
 * Sign-up carries the same param through its "sign in" links and the
 * post-verification callback so the continuation survives the whole
 * sign-up → verify → sign-in flow.
 */

/** Where a successful sign-in lands when no (valid) `next` param exists. */
export const DEFAULT_SIGNED_IN_PATH = "/account";

/**
 * Validates a `?next=` continuation target, returning it only if it is a
 * same-origin relative path. Everything else — absolute URLs
 * (`https://evil.com`, which lacks the leading "/"), protocol-relative URLs
 * (`//evil.com`), backslash variants (`/\evil.com`, which browsers treat as
 * `//evil.com`), and values with control characters (tab/newline are
 * stripped by URL parsers, so `/\t/evil.com` would resolve to
 * `//evil.com`) — is rejected so the param can't become an open redirect.
 */
export function safeNextPath(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  // oxlint-disable-next-line eslint/no-control-regex
  if (/[\x00-\x1f]/.test(value)) return undefined;
  return value;
}

/** The sign-in URL that continues to `next` after a successful sign-in. */
export function signInUrl(next?: string): string {
  return next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
}

/** The sign-up URL that carries the continuation through to sign-in. */
export function signUpUrl(next?: string): string {
  return next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";
}

/** Maps OAuth error codes to friendly display messages. */
export function formatAuthErrorMessage(error?: string | string[]): string | undefined {
  if (typeof error !== "string" || !error) return undefined;
  switch (error.toLowerCase()) {
    case "access_denied":
      return "Google sign-in was cancelled.";
    case "terms_acceptance_required":
    // Better Auth's OAuth account helper turns creation-hook errors into
    // their message with spaces replaced by underscores.
    case TERMS_REQUIRED_MESSAGE.replaceAll(" ", "_").toLowerCase():
      return "Please review the Terms of Service and try again to create your account.";
    case "unable_to_link_account":
    case "account_not_linked":
      return "Unable to link your Google account. An unverified account with this email already exists. Please verify your email first or sign in with your password.";
    case "email_doesn't_match":
      return "The Google account email does not match your existing account email.";
    default:
      return "Sign in with Google failed. Please try again or use your password.";
  }
}
