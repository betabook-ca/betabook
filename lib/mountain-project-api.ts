import { ActionError } from "@/lib/action-result";
import { parseMountainProjectUserId } from "@/lib/mountain-project-profile";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/sends-import";
import { SUPPORT_EMAIL } from "@/lib/support";

const ORIGIN = "https://www.mountainproject.com";
const FORMAT_ERROR = `Mountain Project returned an unexpected response. Download your ticks as a CSV from Mountain Project and upload that file instead, or email ${SUPPORT_EMAIL}.`;
const NOT_FOUND_ERROR =
  "That Mountain Project profile could not be found. Check the user ID or profile link.";
const SIZE_ERROR = `This Mountain Project tick list is too large for a direct import. Email ${SUPPORT_EMAIL} for help importing it.`;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Tick-export paths ignore the slug, so an unresolved name still downloads. */
const FALLBACK_SLUG = "ticks";

async function request(path: string, signal: AbortSignal, timeoutMs: number) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, timeoutMs);
  try {
    return await fetch(`${ORIGIN}${path}`, {
      credentials: "omit",
      // Workers rejects "error" before fetching; callers judge each redirect.
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    signal.throwIfAborted();
    if (controller.signal.aborted)
      throw new ActionError("Mountain Project took too long to respond. Please try again.");
    throw new ActionError(
      `Couldn't connect to Mountain Project. Please try again, or email ${SUPPORT_EMAIL}.`,
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}

function checkStatus(response: Response) {
  if (response.status === 404) throw new ActionError(NOT_FOUND_ERROR);
  if (response.status === 429)
    throw new ActionError(
      "Mountain Project is receiving too many requests. Wait a moment and try again.",
    );
  if (response.status === 403)
    throw new ActionError(
      `Mountain Project would not share this tick list. Download it as a CSV and upload that file instead, or email ${SUPPORT_EMAIL}.`,
    );
  if (response.status >= 500)
    throw new ActionError("Mountain Project is temporarily unavailable. Please try again later.");
}

/** Cosmetic: an unfamiliar redirect falls back instead of failing the import. */
async function resolveUsername(userId: string, signal: AbortSignal): Promise<string> {
  const response = await request(`/user/${userId}`, signal, 15_000);
  await response.body?.cancel();
  checkStatus(response);
  if (!REDIRECTS.has(response.status)) return "";
  const location = response.headers.get("Location") ?? "";
  const match = new RegExp(
    `^(?:${ORIGIN})?/user/${userId}/([a-zA-Z0-9._~-]{1,120})/?(?:[?#]|$)`,
  ).exec(location);
  return match ? match[1] : "";
}

async function readCsv(response: Response): Promise<string> {
  checkStatus(response);
  if (REDIRECTS.has(response.status) || !response.ok) throw new ActionError(FORMAT_ERROR);
  if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("text/csv"))
    throw new ActionError(FORMAT_ERROR);
  if (!response.body) throw new ActionError(FORMAT_ERROR);
  if (Number(response.headers.get("Content-Length")) > MAX_IMPORT_FILE_BYTES)
    throw new ActionError(SIZE_ERROR);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let csv = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_FILE_BYTES) throw new ActionError(SIZE_ERROR);
      csv += decoder.decode(value, { stream: true });
    }
    csv += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!csv.trim()) throw new ActionError(FORMAT_ERROR);
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
    throw new ActionError(
      error instanceof Error ? error.message : "Enter your Mountain Project user ID.",
    );
  }
  const username = await resolveUsername(userId, signal);
  const response = await request(
    `/user/${userId}/${username || FALLBACK_SLUG}/tick-export`,
    signal,
    45_000,
  );
  try {
    return { userId, username, csv: await readCsv(response) };
  } finally {
    if (!response.body?.locked) await response.body?.cancel();
  }
}
