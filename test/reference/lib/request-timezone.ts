import { headers } from "next/headers";

/** Set by worker.ts from `request.cf.timezone` — the IANA zone Cloudflare
 * resolves for the visitor's IP — after discarding any value the client sent.
 * App Router pages can read headers but never the Worker's `Request`, so this
 * is how the edge's answer reaches a page. */
export const REQUEST_TIMEZONE_HEADER = "x-betabook-timezone";

/** `headers` with the timezone header set to the edge's `request.cf.timezone`,
 * or removed when the edge gave none. Whatever the client sent is never kept:
 * pages trust this header, and an arbitrary zone would either skew "today"
 * or throw a RangeError in `Intl`. */
export function withRequestTimezone(headers: Headers, timezone: unknown): Headers {
  const next = new Headers(headers);
  if (typeof timezone === "string" && timezone) next.set(REQUEST_TIMEZONE_HEADER, timezone);
  else next.delete(REQUEST_TIMEZONE_HEADER);
  return next;
}

/** The visitor's timezone, for resolving "today" on the server. UTC when the
 * edge could not place the request. */
export async function getRequestTimezone(): Promise<string> {
  return (await headers()).get(REQUEST_TIMEZONE_HEADER) || "UTC";
}
