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
 * query string, and any credential-like path segment or string in error text
 * becomes "[token]": share tokens, password-reset tokens, session tokens and
 * avatar keys are all working capabilities. Error text also loses Drizzle's
 * "params:" list (the bound values of a failed query), the input a JSON parse
 * error quotes, and email addresses. Redaction is pattern-based, so a new log
 * field needs the same care. */

export const REQUEST_ERROR_EVENT = "request_error";
export const CLIENT_ERROR_EVENT = "client_error";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 4000;
const MAX_CAUSES = 4;
/** `lower(hex(randomblob(16)))`, a share-link token. Safe to match anywhere,
 * stack frames included: nothing else in a frame has this shape. */
const SHARE_TOKEN = /\b[0-9a-f]{32}\b/gi;
/** A run of URL-safe characters long enough to be a credential. */
const LONG_RUN = /[A-Za-z0-9_-]{16,}/g;
/** The tail of a DrizzleQueryError message: `Failed query: <sql>\nparams: <values>`. */
const QUERY_PARAMS = /\nparams: [\s\S]*$/;
/** V8 quotes the input it failed to parse: `Unexpected token 'm', "my journal…" is not valid JSON`. */
const JSON_INPUT = /(?:\.\.\.)?"(?:[^"\\]|\\.)*"(?:\.\.\.)? is not valid JSON/g;
const EMAIL = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[A-Za-z]{2,}/g;
const STACK_FRAME = /^\s+at /;

/** True for a string that looks like a credential rather than a word: share
 * tokens (32 hex), better-auth session and reset tokens and user ids (random
 * mixed-case alphanumerics), avatar keys (64 hex). A heuristic: slugs, SQL
 * identifiers and camelCase names are lowercase, or have no digits and few
 * capitals, so they stay readable. */
function isCredentialLike(run: string) {
  if (run.length < 16) return false;
  if (/^\d+$/.test(run)) return true;
  if (!/[A-Za-z]/.test(run)) return false;
  if (/\d/.test(run)) return true;
  const upper = run.replace(/[^A-Z]/g, "").length;
  const lower = run.replace(/[^a-z]/g, "").length;
  return upper >= 4 && lower >= 4;
}

function redactCredentials(text: string) {
  return text.replace(LONG_RUN, (run) => (isCredentialLike(run) ? "[token]" : run));
}

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

/** Error text safe to log: no bound query values, no quoted parse input, no
 * email address and no credential-like string. Runs before truncation, so a
 * cut cannot leave half a token behind. */
function scrubErrorText(text: string) {
  return redactCredentials(
    text
      .replace(QUERY_PARAMS, "\nparams: [redacted]")
      .replace(JSON_INPUT, '"[redacted]" is not valid JSON')
      .replace(EMAIL, "[email]"),
  );
}

/** A stack opens with "Name: message", so it repeats whatever the message
 * holds. That header is scrubbed like the message. The frames below it lose
 * only share tokens: the broader credential pattern would also eat hashed
 * chunk names such as `error-reporting-DX7JKinh.js`. When the message cannot
 * be found in the stack, only the frames are kept. */
function scrubStack(stack: string, message: string) {
  const at = message ? stack.indexOf(message) : -1;
  const scrubbed =
    at >= 0
      ? stack.slice(0, at) + scrubErrorText(message) + stack.slice(at + message.length)
      : stack
          .split("\n")
          .filter((line) => STACK_FRAME.test(line))
          .join("\n");
  return scrubbed.replace(SHARE_TOKEN, "[token]");
}

function summarizeError(error: unknown): ErrorSummary {
  const causes: ErrorSummary["causes"] = [];
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause != null && causes.length < MAX_CAUSES) {
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

function stampedDigest(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return undefined;
  return typeof error.digest === "string" && error.digest ? error.digest : undefined;
}

/** The digest the browser's error page receives for this error. vinext calls
 * `onRequestError` before it stamps the digest, so this repeats its formula:
 * Next's string-hash (djb2, read right to left) over message and stack. An
 * error that already carries a digest keeps it. */
export function errorDigest(error: unknown) {
  const stamped = stampedDigest(error);
  if (stamped) return stamped;
  const input = error instanceof Error ? error.message + (error.stack || "") : String(error);
  let hash = 5381;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    // oxlint-disable-next-line eslint/no-bitwise -- djb2 is defined by this XOR; it must match vinext's digest bit for bit
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // oxlint-disable-next-line eslint/no-bitwise -- unsigned 32-bit, as string-hash returns
  return (hash >>> 0).toString();
}

/** A path safe to log: no query string or fragment, and no segment that looks
 * like a credential (share tokens, password-reset tokens, avatar keys). */
export function redactPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return pathname
    .split("/")
    .map((segment) => (isCredentialLike(segment) ? "[token]" : segment))
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

/** vinext's HTML-rendering error handler reports whatever reaches it,
 * including the production copy of a server component error that the RSC
 * stream carried: a generic message under a digest the RSC render already
 * logged. Next.js drops that copy; this does too. In a production build
 * (`pnpm preview`) a page-level throw and a throw inside a `<Suspense>`
 * section each logged once without this check, so it is a guard for paths
 * that do re-report. An error raised in HTML rendering itself carries no
 * digest and is logged. */
export function logRequestError(...args: RequestErrorArgs) {
  const [error, , context] = args;
  if (context.renderSource === "server-rendering" && stampedDigest(error)) return;
  console.error(requestErrorLog(...args));
}

/** For the unexpected errors `toActionResult` catches: the action returns a
 * generic message, so the error never reaches `onRequestError`. Same event as
 * a server error, without the route, which the wrapper does not know, and
 * without a digest, since no browser is shown one to match. */
export function logActionError(error: unknown) {
  console.error({
    event: REQUEST_ERROR_EVENT,
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
