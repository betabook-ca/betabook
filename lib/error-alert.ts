import { getCloudflareEnv } from "@/lib/cloudflare-env";
import { sendErrorAlertEmail } from "@/lib/email";

/** Emails the maintainer when production logs errors.
 *
 * Cloudflare has no notification for Worker errors, so a cron runs this every
 * ten minutes. It counts error-level events in the Worker's Observability logs
 * through the Telemetry query API. That covers the `request_error` and
 * `client_error` lines from `lib/error-reporting.ts` and every other
 * `console.error`. The alert is off unless both `ERROR_ALERT_*` secrets are
 * set, like live usage on /costs.
 *
 * Each run looks at a ten-minute window that ends five minutes before the
 * cron fired, because logs take a moment to become searchable. Consecutive
 * windows touch, so no error falls between runs. The first errors after an
 * hour without any send an email at once. While errors continue, only the
 * window that contains the hour sends one, so a lasting fault sends one email
 * an hour instead of six. */

export const ERROR_ALERT_CRON = "*/10 * * * *";

const QUERY_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`;
const SCRIPT_NAME = "betabook";
const WINDOW_MS = 10 * 60_000;
const INGEST_DELAY_MS = 5 * 60_000;
const HOUR_MS = 60 * 60_000;
const QUIET_PERIOD_MS = HOUR_MS;
const SAMPLE_LIMIT = 5;
const SAMPLE_TEXT_LENGTH = 300;

type TelemetryEvent = {
  timestamp: number;
  source?: unknown;
  $metadata?: { message?: string; error?: string };
};
type TelemetryResult = { events?: { count?: number; events?: TelemetryEvent[] } };

async function queryErrors(
  accountId: string,
  token: string,
  from: number,
  to: number,
  limit: number,
) {
  const response = await fetch(QUERY_URL(accountId), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      queryId: "betabook-error-alert",
      view: "events",
      limit,
      timeframe: { from, to },
      parameters: {
        filterCombination: "and",
        filters: [
          { key: "$workers.scriptName", operation: "eq", type: "string", value: SCRIPT_NAME },
          { key: "$metadata.level", operation: "eq", type: "string", value: "error" },
        ],
      },
    }),
  });
  // A failed query throws, so the cron invocation shows as failed in the
  // dashboard rather than passing as a quiet window.
  if (!response.ok) throw new Error(`Telemetry query failed with ${response.status}`);
  const { result } = (await response.json()) as { result?: TelemetryResult };
  const events = result?.events?.events ?? [];
  return { count: result?.events?.count ?? events.length, events };
}

function field(source: unknown, key: string) {
  if (!source || typeof source !== "object") return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** One line per sample: when, what kind, where, and the message. The D1 or
 * other root cause is the last entry of a request error's `causes`. */
export function describeErrorEvent(event: TelemetryEvent) {
  const { source } = event;
  const error =
    source && typeof source === "object"
      ? ((source as Record<string, unknown>).error as
          | { message?: string; causes?: { message?: string }[] }
          | undefined)
      : undefined;
  const message =
    error?.causes?.at(-1)?.message ??
    error?.message ??
    field(source, "message") ??
    (typeof source === "string" ? source : undefined) ??
    event.$metadata?.error ??
    event.$metadata?.message ??
    "(no message)";
  const parts = [
    new Date(event.timestamp).toISOString(),
    field(source, "event"),
    field(source, "routePath") ?? field(source, "path"),
    field(source, "digest") ? `digest ${field(source, "digest")}` : undefined,
    message.length > SAMPLE_TEXT_LENGTH ? `${message.slice(0, SAMPLE_TEXT_LENGTH)}…` : message,
  ];
  return parts.filter(Boolean).join(" · ");
}

export type ErrorAlertOutcome =
  | { status: "off" }
  | { status: "quiet" }
  | { status: "suppressed"; count: number }
  | { status: "sent"; count: number };

export async function runErrorAlert(scheduledTime: number): Promise<ErrorAlertOutcome> {
  const env = await getCloudflareEnv();
  const accountId = env.ERROR_ALERT_ACCOUNT_ID;
  const token = env.ERROR_ALERT_API_TOKEN;
  if (!accountId || !token) return { status: "off" };

  const to = scheduledTime - INGEST_DELAY_MS;
  const from = to - WINDOW_MS;
  const current = await queryErrors(accountId, token, from, to, SAMPLE_LIMIT);
  if (current.count === 0) return { status: "quiet" };

  // The windows tile the timeline, so exactly one an hour contains the hour.
  const crossesTheHour = Math.floor(from / HOUR_MS) !== Math.floor(to / HOUR_MS);
  if (!crossesTheHour) {
    const before = await queryErrors(accountId, token, from - QUIET_PERIOD_MS, from, 1);
    if (before.count > 0) return { status: "suppressed", count: current.count };
  }

  const window = `${new Date(from).toISOString()} to ${new Date(to).toISOString()}`;
  await sendErrorAlertEmail({
    subject: `Betabook: ${current.count} production error${current.count === 1 ? "" : "s"}`,
    text: [
      `The betabook Worker logged ${current.count} error-level event${current.count === 1 ? "" : "s"} from ${window}.`,
      "",
      ...current.events.map(describeErrorEvent),
      "",
      "Search the Worker's Observability logs for the digest or the route for the full event. While errors continue, this email repeats once an hour.",
    ].join("\n"),
  });
  return { status: "sent", count: current.count };
}
