import type { Instrumentation } from "next";

/** Structured error lines for Workers Observability.
 *
 * vinext logs no production server error: a page that fails in a server
 * component streams the error page with a 200, and the browser gets only a
 * digest. `instrumentation.ts` passes server errors to `logRequestError`, and
 * `toActionResult` passes the action errors it catches (which never reach
 * instrumentation) to `logActionError`. Both log a `request_error` event.
 * `/api/client-errors` passes the error pages browsers report to
 * `logClientError`, a `client_error` event. That report is best-effort: a
 * rate-limited or failed beacon is not logged. A log search or an alert can
 * match on the fixed `event` field.
 *
 * Nothing logged may carry a working link or user data. Paths lose their
 * query string; every share token in a path or error text becomes "[token]",
 * because list, trip and project links are capabilities; and Drizzle's
 * "params:" list, the bound values of a failed query (emails, journal text,
 * tokens), is dropped from messages and stacks. */

export const REQUEST_ERROR_EVENT = "request_error";
export const CLIENT_ERROR_EVENT = "client_error";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 4000;
const MAX_CAUSES = 4;
/** `lower(hex(randomblob(16)))`, the shape of every share-link token. */
const TOKEN_SEGMENT = /^[0-9a-f]{32}$/i;
const TOKEN_IN_TEXT = /\b[0-9a-f]{32}\b/gi;
/** The tail of a DrizzleQueryError message: `Failed query: <sql>\nparams: <values>`. */
const QUERY_PARAMS = /\nparams: [\s\S]*$/;
const STACK_FRAME = /^\s+at /;

type ErrorSummary = {
  name: string;
  message: string;
  stack?: string;
  /** `error.cause` chain, outermost first. Drizzle puts the D1 message
   * ("D1_ERROR: …") here under its own "Failed query: …". */
  causes: { name: string; message: string }[];
};

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describe(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: typeof error, message: String(error) };
}

/** Error text safe to log: no bound query values and no share token. Runs
 * before truncation, so a cut cannot leave half a token behind. */
function scrubErrorText(text: string) {
  return text.replace(QUERY_PARAMS, "\nparams: [redacted]").replace(TOKEN_IN_TEXT, "[token]");
}

/** A stack opens with "Name: message", so it repeats whatever the message
 * holds. That header is scrubbed like the message. When the message cannot be
 * found in the stack, only the frames are kept. */
function scrubStack(stack: string, message: string) {
  const at = message ? stack.indexOf(message) : -1;
  const scrubbed =
    at >= 0
      ? stack.slice(0, at) + scrubErrorText(message) + stack.slice(at + message.length)
      : stack
          .split("\n")
          .filter((line) => STACK_FRAME.test(line))
          .join("\n");
  return scrubbed.replace(TOKEN_IN_TEXT, "[token]");
}

function summarizeError(error: unknown): ErrorSummary {
  const causes: ErrorSummary["causes"] = [];
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined && causes.length < MAX_CAUSES) {
    const { name, message } = describe(cause);
    causes.push({ name, message: truncate(scrubErrorText(message), MAX_MESSAGE_LENGTH) });
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const { name, message } = describe(error);
  return {
    name,
    message: truncate(scrubErrorText(message), MAX_MESSAGE_LENGTH),
    ...(error instanceof Error && error.stack
      ? { stack: truncate(scrubStack(error.stack, message), MAX_STACK_LENGTH) }
      : {}),
    causes,
  };
}

/** The digest the browser's error page receives for this error. vinext calls
 * `onRequestError` before it stamps the digest, so this repeats its formula:
 * Next's string-hash (djb2, read right to left) over message and stack. An
 * error that already carries a digest keeps it. */
export function errorDigest(error: unknown) {
  if (error && typeof error === "object" && "digest" in error) return String(error.digest);
  const input = error instanceof Error ? error.message + (error.stack || "") : String(error);
  let hash = 5381;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    // oxlint-disable-next-line eslint/no-bitwise -- djb2 is defined by this XOR; it must match vinext's digest bit for bit
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // oxlint-disable-next-line eslint/no-bitwise -- unsigned 32-bit, as string-hash returns
  return (hash >>> 0).toString();
}

/** A path safe to log: no query string or fragment, and no share token. */
export function redactPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return pathname
    .split("/")
    .map((segment) => (TOKEN_SEGMENT.test(segment) ? "[token]" : segment))
    .join("/");
}

type RequestErrorArgs = Parameters<Instrumentation.onRequestError>;

function requestErrorLog(
  error: RequestErrorArgs[0],
  request: RequestErrorArgs[1],
  context: RequestErrorArgs[2],
) {
  return {
    event: REQUEST_ERROR_EVENT,
    digest: errorDigest(error),
    method: request.method,
    path: redactPath(request.path),
    routePath: context.routePath,
    routeType: context.routeType,
    ...(context.renderSource ? { renderSource: context.renderSource } : {}),
    error: summarizeError(error),
  };
}

export function logRequestError(...args: RequestErrorArgs) {
  console.error(requestErrorLog(...args));
}

/** For the unexpected errors `toActionResult` catches: the action returns a
 * generic message, so the error never reaches `onRequestError`. Same event
 * as a server error, without the route, which the wrapper does not know. */
export function logActionError(error: unknown) {
  console.error({
    event: REQUEST_ERROR_EVENT,
    digest: errorDigest(error),
    routeType: "action",
    error: summarizeError(error),
  });
}

export type ClientErrorReport = {
  /** Which boundary rendered: the root `app/error.tsx` or `app/global-error.tsx`. */
  boundary: "page" | "global";
  /** The server digest, when a server error caused the page. */
  digest?: string;
  message: string;
  path: string;
};

const MAX_DIGEST_LENGTH = 64;
const MAX_PATH_LENGTH = 512;

/** Validates a beacon body from `reportClientError`. Anything the boundary
 * would not send is refused rather than repaired, so a hand-made request
 * cannot write arbitrary fields into the logs. */
export function parseClientErrorReport(body: unknown): ClientErrorReport | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { boundary, digest, message, path } = body as Record<string, unknown>;
  if (boundary !== "page" && boundary !== "global") return null;
  if (typeof message !== "string" || typeof path !== "string" || !path.startsWith("/")) return null;
  if (path.length > MAX_PATH_LENGTH) return null;
  if (digest !== undefined && (typeof digest !== "string" || digest.length > MAX_DIGEST_LENGTH))
    return null;
  return {
    boundary,
    ...(digest ? { digest } : {}),
    message: truncate(scrubErrorText(message), MAX_MESSAGE_LENGTH),
    path: redactPath(path),
  };
}

export function logClientError(report: ClientErrorReport) {
  console.error({ event: CLIENT_ERROR_EVENT, ...report });
}
