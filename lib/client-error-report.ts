import type { ClientErrorReport } from "@/lib/error-reporting";

const CLIENT_ERROR_ENDPOINT = "/api/client-errors";
/** Keeps a report under the endpoint's 4,096-byte cap whatever the message
 * holds: JSON escapes a control character to 6 bytes, so 500 characters are
 * at most 3,000 bytes, beside a percent-encoded path and a short digest. */
const MAX_MESSAGE_LENGTH = 500;
/** The endpoint refuses a longer path, so a long or heavily encoded URL is
 * cut rather than losing the whole report. `pathname` is percent-encoded
 * ASCII, so characters are bytes. */
const MAX_PATH_LENGTH = 512;
/** The endpoint keeps only short, vinext-shaped digests. A longer one is left
 * out here, so it cannot push the body past the 4 KB cap and lose the report. */
const MAX_DIGEST_LENGTH = 64;

/** Tells the server that this browser is showing an error page. Fire and
 * forget, and best-effort: reporting must never throw inside an error
 * boundary, a beacon still goes out if the person leaves the page straight
 * away, and a report that fails or is rate-limited is simply lost. */
export function reportClientError(
  boundary: ClientErrorReport["boundary"],
  error: Error & { digest?: string },
) {
  try {
    // React passes the boundary whatever was thrown, which need not be an
    // Error: a thrown string or `{}` must still produce a report.
    const thrown: unknown = error;
    const digest =
      thrown &&
      typeof thrown === "object" &&
      "digest" in thrown &&
      typeof thrown.digest === "string" &&
      thrown.digest.length <= MAX_DIGEST_LENGTH
        ? thrown.digest
        : undefined;
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    const report: ClientErrorReport = {
      boundary,
      ...(digest ? { digest } : {}),
      message: message.slice(0, MAX_MESSAGE_LENGTH),
      path: window.location.pathname.slice(0, MAX_PATH_LENGTH),
    };
    const body = JSON.stringify(report);
    const sent = navigator.sendBeacon?.(
      CLIENT_ERROR_ENDPOINT,
      new Blob([body], { type: "application/json" }),
    );
    if (!sent) {
      void fetch(CLIENT_ERROR_ENDPOINT, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Nothing to do: the page is already showing the error.
  }
}
