import { ActionError } from "@/lib/action-result";
import {
  KAYA_MAX_RETRIES,
  KAYA_PAGE_SIZE,
  type KayaRetry,
  type KayaStreamEvent,
} from "@/lib/kaya-import-stream";
import { parseKayaUsername } from "@/lib/kaya-profile";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from "@/lib/sends-import";
import { importCsvFallback, importTooLargeMessage, SUPPORT_EMAIL } from "@/lib/support";

const CSV_FALLBACK = importCsvFallback("KAYA", "logbook");
const FORMAT_ERROR = `KAYA returned an unexpected format. ${CSV_FALLBACK}`;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const PROFILE_QUERY = `query webUser($username: String!) {
  webUser(username: $username) { id username is_private }
}`;
const ASCENTS_QUERY = `query webAscentsForUser($userId: ID!, $climbTypeId: ID!, $offset: Int!, $includeTotal: Boolean!) {
  webAscentsForUser(user_id: $userId, climb_type_id: $climbTypeId,
    filter_by: OUTDOOR, sort_by: DATE, offset: $offset, count: ${KAYA_PAGE_SIZE}) {
    id date comment rating stiffness grade { name }
    climb {
      id name climb_type { id name } grade { name }
      gym { name } board { name } destination { name } area { name }
    }
  }
  webFilterDistributionForAscents(user_id: $userId, climb_type_id: $climbTypeId,
    filter_by: OUTDOOR) @include(if: $includeTotal) { data { ascent_count } }
}`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ActionError(FORMAT_ERROR);
  return value as Record<string, unknown>;
}

class RetryableKayaError extends ActionError {
  public reason: KayaRetry["reason"];
  public retryAfterMs: number;
  public constructor(reason: KayaRetry["reason"], retryAfterMs = 0) {
    super(
      reason === "rate-limit"
        ? "KAYA is receiving too many requests. Please try again later."
        : "KAYA is temporarily unavailable. Please try again later.",
    );
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(value: string | null) {
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function readResponse(response: Response) {
  if (response.status === 429)
    throw new RetryableKayaError("rate-limit", retryAfterMs(response.headers.get("Retry-After")));
  if ([408, 500, 502, 503, 504].includes(response.status))
    throw new RetryableKayaError("unavailable", retryAfterMs(response.headers.get("Retry-After")));
  if (!response.ok)
    throw new ActionError(`KAYA could not share this public profile. ${CSV_FALLBACK}`);
  if (!response.body || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES)
    throw new ActionError(FORMAT_ERROR);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new ActionError(FORMAT_ERROR);
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const result = record(JSON.parse(body));
  if (result.errors != null && (!Array.isArray(result.errors) || result.errors.length)) {
    if (!Array.isArray(result.errors)) throw new ActionError(FORMAT_ERROR);
    const codes = result.errors.map((error) => {
      const extensions = record(error).extensions;
      return extensions == null ? null : record(extensions).code;
    });
    const retryable = new Set<unknown>([
      "INTERNAL_SERVER_ERROR",
      "RATE_LIMITED",
      "TOO_MANY_REQUESTS",
    ]);
    if (codes.every((code) => retryable.has(code)))
      throw new RetryableKayaError(
        codes.includes("RATE_LIMITED") || codes.includes("TOO_MANY_REQUESTS")
          ? "rate-limit"
          : "unavailable",
        retryAfterMs(response.headers.get("Retry-After")),
      );
    throw new ActionError(FORMAT_ERROR);
  }
  return record(result.data);
}

async function requestKaya(query: string, variables: Record<string, unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  try {
    const response = await fetch("https://kaya-beta.kayaclimb.com/graphql", {
      method: "POST",
      credentials: "omit",
      // Workers rejects "error" before fetching. Manual keeps the fixed
      // upstream URL; readResponse rejects redirect statuses without retrying.
      redirect: "manual",
      signal: controller.signal,
      // KAYA requires the public website Origin/Referer. Never forward user credentials.
      headers: {
        "Content-Type": "application/json",
        Origin: "https://kaya-app.kayaclimb.com",
        Referer: "https://kaya-app.kayaclimb.com/",
      },
      body: JSON.stringify({ query, variables }),
    });
    try {
      return await readResponse(response);
    } finally {
      if (!response.body?.locked) await response.body?.cancel();
    }
  } catch (error) {
    signal.throwIfAborted();
    if (controller.signal.aborted || error instanceof TypeError)
      throw new RetryableKayaError("unavailable");
    if (error instanceof ActionError) throw error;
    throw new ActionError(FORMAT_ERROR);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

async function queryKaya(
  query: string,
  variables: Record<string, unknown>,
  signal: AbortSignal,
  emit: (event: KayaStreamEvent) => void,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestKaya(query, variables, signal);
    } catch (error) {
      if (!(error instanceof RetryableKayaError) || attempt >= KAYA_MAX_RETRIES) throw error;
      // Honor the server's minimum delay. Very long Retry-After values stop
      // automatic retries instead of silently retrying earlier than requested.
      const delay = Math.max(
        5_000 * 2 ** attempt + Math.floor(Math.random() * 1_000),
        error.retryAfterMs,
      );
      if (delay > 120_000)
        throw new ActionError(
          "KAYA asked us to wait longer before retrying. Please try again later.",
        );
      emit({
        type: "retry",
        attempt: attempt + 1,
        delayMs: delay,
        reason: error.reason,
      });
      await waitForKaya(delay, signal);
    }
  }
}

function readTotal(value: unknown): number {
  const distribution = record(value).data;
  if (!Array.isArray(distribution)) throw new ActionError(FORMAT_ERROR);
  let total = 0;
  for (const entry of distribution) {
    const count = record(entry).ascent_count;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)
      throw new ActionError(FORMAT_ERROR);
    total += count;
  }
  if (total > MAX_IMPORT_ROWS)
    throw new ActionError(importTooLargeMessage("KAYA history", CSV_FALLBACK));
  return total;
}

/** Pace public API pagination and release the timer immediately on cancellation. */
function waitForKaya(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function readProfile(value: unknown, username: string) {
  if (value == null)
    throw new ActionError(
      "That KAYA profile could not be found. Check the username or profile link.",
    );
  const profile = record(value);
  if (profile.is_private !== false)
    throw new ActionError(
      `KAYA imports need a public profile. Make your profile public, upload KAYA’s CSV export instead, or email ${SUPPORT_EMAIL}.`,
    );
  if (
    typeof profile.id !== "string" ||
    !/^\d+$/.test(profile.id) ||
    typeof profile.username !== "string" ||
    profile.username.toLowerCase() !== username.toLowerCase()
  )
    throw new ActionError(FORMAT_ERROR);
  return { id: profile.id, username: profile.username };
}

/** Download one outdoor discipline after checking the public profile. Paging stays
 * in one request so KAYA is not repeatedly asked for the same profile. */
export async function fetchKayaAscents(
  input: { username: string; climbTypeId: string },
  signal: AbortSignal,
  emit: (event: KayaStreamEvent) => void = () => {},
) {
  let username: string;
  try {
    username = parseKayaUsername(input.username);
  } catch (error) {
    if (error instanceof ActionError) throw error;
    throw new ActionError("Enter your KAYA username.");
  }
  if (!["1", "2"].includes(input.climbTypeId)) throw new ActionError("Invalid KAYA discipline.");
  const data = await queryKaya(PROFILE_QUERY, { username }, signal, emit);
  const profile = readProfile(data.webUser, username);
  emit({ type: "profile", username: profile.username });
  let received = 0;
  let total = 0;
  let size = 0;
  for (let offset = 0; ; offset += KAYA_PAGE_SIZE) {
    if (offset > 0) await waitForKaya(2_000, signal);
    const page = await queryKaya(
      ASCENTS_QUERY,
      { userId: profile.id, climbTypeId: input.climbTypeId, offset, includeTotal: offset === 0 },
      signal,
      emit,
    );
    const batch = page.webAscentsForUser;
    if (!Array.isArray(batch) || batch.length > KAYA_PAGE_SIZE) throw new ActionError(FORMAT_ERROR);
    if (offset === 0) total = readTotal(page.webFilterDistributionForAscents);
    received += batch.length;
    size += new TextEncoder().encode(JSON.stringify(batch)).byteLength;
    if (size > MAX_IMPORT_FILE_BYTES)
      throw new ActionError(importTooLargeMessage("KAYA history", CSV_FALLBACK));
    if (received > total || (batch.length < KAYA_PAGE_SIZE && received !== total))
      throw new ActionError(
        `Couldn't load your complete KAYA history, or it changed during download. Please try again. ${CSV_FALLBACK}`,
      );
    emit({ type: "page", items: batch, total });
    if (batch.length < KAYA_PAGE_SIZE) break;
  }
  return { username: profile.username, total };
}
