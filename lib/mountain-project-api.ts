import { ActionError } from "@/lib/action-result";
import { parseMountainProjectUserId } from "@/lib/mountain-project-profile";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/sends-import";
import { importTooLargeMessage, SUPPORT_EMAIL } from "@/lib/support";

const ORIGIN = "https://www.mountainproject.com";
const FORMAT_ERROR = `Mountain Project returned an unexpected response. Download your ticks as a CSV from Mountain Project and upload that file instead, or email ${SUPPORT_EMAIL}.`;
const NOT_FOUND_ERROR =
  "That Mountain Project profile could not be found. Check the user ID or profile link.";
const SIZE_ERROR = importTooLargeMessage("Mountain Project tick list");
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Tick-export paths ignore the slug, so an unresolved name still downloads. */
const FALLBACK_SLUG = "ticks";

/** Carries the status the route answers with, so a mistyped profile is not
 * recorded as an upstream outage. */
export class MountainProjectError extends ActionError {
  public status: number;
  public constructor(message: string, status = 502) {
    super(message);
    this.name = "MountainProjectError";
    this.status = status;
  }
}

/** The deadline and the caller's cancellation have to cover reading the body:
 * in Workers a fetch resolves once the headers arrive, while the export is
 * still streaming. */
async function request<T>(
  path: string,
  signal: AbortSignal,
  timeoutMs: number,
  read: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(`${ORIGIN}${path}`, {
      credentials: "omit",
      // Workers rejects "error" before fetching; callers judge each redirect.
      redirect: "manual",
      signal: controller.signal,
    });
    try {
      return await read(response, controller.signal);
    } finally {
      if (!response.body?.locked) await response.body?.cancel().catch(() => {});
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof MountainProjectError) throw error;
    if (controller.signal.aborted)
      throw new MountainProjectError(
        "Mountain Project took too long to respond. Please try again.",
        504,
      );
    throw new MountainProjectError(
      `Couldn't connect to Mountain Project. Please try again, or email ${SUPPORT_EMAIL}.`,
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

function checkStatus(response: Response) {
  if (response.status === 404) throw new MountainProjectError(NOT_FOUND_ERROR, 404);
  if (response.status === 429)
    throw new MountainProjectError(
      "Mountain Project is receiving too many requests. Wait a moment and try again.",
      429,
    );
  if (response.status === 403)
    throw new MountainProjectError(
      `Mountain Project would not share this tick list. Download it as a CSV and upload that file instead, or email ${SUPPORT_EMAIL}.`,
      403,
    );
  if (response.status >= 500)
    throw new MountainProjectError(
      "Mountain Project is temporarily unavailable. Please try again later.",
    );
}

/** Cosmetic: an unfamiliar redirect falls back instead of failing the import. */
async function resolveUsername(userId: string, signal: AbortSignal): Promise<string> {
  return request(`/user/${userId}`, signal, 15_000, async (response) => {
    await response.body?.cancel().catch(() => {});
    checkStatus(response);
    if (!REDIRECTS.has(response.status)) return "";
    const location = response.headers.get("Location") ?? "";
    const match = new RegExp(
      `^(?:${ORIGIN})?/user/${userId}/([a-zA-Z0-9._~-]{1,120})/?(?:[?#]|$)`,
    ).exec(location);
    return match ? match[1] : "";
  });
}

async function readCsv(response: Response, signal: AbortSignal): Promise<string> {
  checkStatus(response);
  if (REDIRECTS.has(response.status) || !response.ok) throw new MountainProjectError(FORMAT_ERROR);
  if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("text/csv"))
    throw new MountainProjectError(FORMAT_ERROR);
  if (!response.body) throw new MountainProjectError(FORMAT_ERROR);
  if (Number(response.headers.get("Content-Length")) > MAX_IMPORT_FILE_BYTES)
    throw new MountainProjectError(SIZE_ERROR, 413);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let csv = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_FILE_BYTES) throw new MountainProjectError(SIZE_ERROR, 413);
      csv += decoder.decode(value, { stream: true });
    }
    csv += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!csv.trim()) throw new MountainProjectError(FORMAT_ERROR);
  return csv;
}

/** No login is used and no credentials are forwarded. */
export async function fetchMountainProjectTicks(
  input: string,
  signal: AbortSignal,
): Promise<{ userId: string; username: string; csv: string }> {
  let userId: string;
  try {
    userId = parseMountainProjectUserId(input);
  } catch (error) {
    throw new MountainProjectError(
      error instanceof ActionError ? error.message : "Enter your Mountain Project user ID.",
      400,
    );
  }
  const username = await resolveUsername(userId, signal);
  const csv = await request(
    `/user/${userId}/${username || FALLBACK_SLUG}/tick-export`,
    signal,
    45_000,
    readCsv,
  );
  return { userId, username, csv };
}
