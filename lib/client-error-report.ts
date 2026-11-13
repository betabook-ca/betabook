import type { ClientErrorReport } from "@/lib/error-reporting";

const CLIENT_ERROR_ENDPOINT = "/api/client-errors";

/** Tells the server that this browser is showing an error page. Fire and
 * forget: reporting must never throw inside an error boundary, and a beacon
 * still goes out if the person leaves the page straight away. */
export function reportClientError(
  boundary: ClientErrorReport["boundary"],
  error: Error & { digest?: string },
) {
  try {
    const report: ClientErrorReport = {
      boundary,
      ...(error.digest ? { digest: error.digest } : {}),
      message: error.message,
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
