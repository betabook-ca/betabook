import { logClientError, parseClientErrorReport } from "@/lib/error-reporting";
import { allowClientErrorReport } from "@/lib/rate-limit";

/** A report is a few short strings; anything larger was not sent by the
 * error boundary. */
const MAX_BODY_BYTES = 4096;

/** Receives the beacon `reportClientError` sends whenever a browser shows an
 * error page, so each one leaves an error-level log line even when the server
 * logged nothing. No session: a signed-out page can fail too. The origin check
 * and the per-address limit keep other sites and scripts out of the logs. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await allowClientErrorReport(ip))) return new Response(null, { status: 429 });

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = parseClientErrorReport(body);
  if (!report) return new Response(null, { status: 400 });
  logClientError(report);
  return new Response(null, { status: 204 });
}
