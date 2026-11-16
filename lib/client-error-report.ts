import type { ClientErrorReport } from "@/lib/error-reporting";

const CLIENT_ERROR_ENDPOINT = "/api/client-errors";
/** Keeps a report under the endpoint's 4,096-byte cap whatever the message
 * holds: JSON escapes a control character to 6 bytes, so 500 characters are
 * at most 3,000 bytes, beside a percent-encoded path and a short digest. */
const MAX_MESSAGE_LENGTH = 500;

/** Tells the server that this browser is showing an error page. Fire and
 * forget, and best-effort: reporting must never throw inside an error
 * boundary, a beacon still goes out if the person leaves the page straight
 * away, and a report that fails or is rate-limited is simply lost. */
export function reportClientError(
  boundary: ClientErrorReport["boundary"],
  error: Error & { digest?: string },
) {
  try {
    const report: ClientErrorReport = {
      boundary,
      ...(error.digest ? { digest: error.digest } : {}),
      message: error.message.slice(0, MAX_MESSAGE_LENGTH),
      path: window.location.pathname,
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
