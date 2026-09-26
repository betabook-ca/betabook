import { parseSendageUsername } from "@/lib/sendage-profile";
import { ISO_DATE_RE } from "@/lib/sends";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type ParsedCsv } from "@/lib/sends-import";
import { importTooLargeMessage, SUPPORT_EMAIL } from "@/lib/support";

const FORMAT_ERROR = `Sendage returned an unfamiliar data format. Please try again later, or email ${SUPPORT_EMAIL}.`;
const INCOMPLETE_ERROR = `Sendage did not return your complete send history. Please try again, or email ${SUPPORT_EMAIL}.`;
const SIZE_ERROR = importTooLargeMessage("Sendage history");
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const COMPLETED_STYLES = new Set(["redpoint", "flash", "onsight"]);
const SKIPPED_STYLES = new Set(["project", "repeat"]);
const HEADERS = [
  "Date",
  "Send Type",
  "Climb",
  "Climb Type",
  "Area",
  "Region",
  "Grade",
  "Posted Grade",
  "Grade Feel",
  "Rating",
  "Comments",
  "Beta",
  "Attempts",
  "First Ascent",
];

// Sendage's North American grade ID ranges, verified against its public client
// on 2026-09-08: https://sendage.com/webapp-assets/index-D30Z5_34.js
// The table has contiguous IDs 1–140, with boulder labels through 96. These
// IDs are independent of the viewer’s grading preference. Sport and trad share YDS.
const BOULDER_ENDS = [12, 16, 20, 25, 31, 37, 42, 46, 51, 57, 62, 67, 72, 77, 82, 87, 92, 96];
const ROUTE_ENDS = [
  1, 2, 3, 4, 5, 6, 10, 17, 25, 30, 35, 40, 45, 49, 52, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  105, 110, 115, 120, 125, 130, 135, 140,
];

function gradeLabel(value: unknown, type: string) {
  const ends = type === "boulder" ? BOULDER_ENDS : ROUTE_ENDS;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > ends[ends.length - 1]
  )
    throw new Error(
      `Sendage returned an unknown ${type} grade ID. Import stopped; no sends were imported.`,
    );
  const index = ends.findIndex((end) => value <= end);
  if (type === "boulder") return `V${index}`;
  if (index < 9) return `5.${index + 1}`;
  return `5.${10 + Math.floor((index - 9) / 4)}${"abcd"[(index - 9) % 4]}`;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(FORMAT_ERROR);
  return value as Record<string, unknown>;
}
function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error(FORMAT_ERROR);
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error(FORMAT_ERROR);
  return value;
}
function optionalString(value: unknown): string {
  return value == null ? "" : string(value);
}

async function request(
  procedure: "user.getProfile" | "activity.getUserActivity",
  input: Record<string, unknown>,
  signal: AbortSignal,
  budget: { bytes: number },
) {
  signal.throwIfAborted();
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    controller.abort();
    void reader?.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 15_000);
  try {
    const url = new URL(`https://sendage.com/api/v2/${procedure}`);
    url.searchParams.set("input", JSON.stringify({ json: input }));
    const response = await fetch(url.toString(), {
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status === 404)
      throw new Error(
        "That Sendage profile could not be found. Check the username or profile link.",
      );
    if (response.status === 401 || response.status === 403)
      throw new Error(
        `Sendage could not share this public profile. Check its visibility, or email ${SUPPORT_EMAIL}.`,
      );
    if (response.status === 429)
      throw new Error("Sendage is receiving too many requests. Wait a moment and try again.");
    if (!response.ok) throw new Error("Couldn't load sends from Sendage. Please try again.");
    if (!response.body) throw new Error(FORMAT_ERROR);
    reader = response.body.getReader();
    const advertisedBytes = Number(response.headers.get("content-length"));
    if (advertisedBytes > MAX_PAGE_BYTES || budget.bytes + advertisedBytes > MAX_IMPORT_FILE_BYTES)
      throw new Error(SIZE_ERROR);
    const decoder = new TextDecoder();
    let body = "";
    let pageBytes = 0;
    controller.signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      controller.signal.throwIfAborted();
      if (done) break;
      pageBytes += value.byteLength;
      budget.bytes += value.byteLength;
      if (pageBytes > MAX_PAGE_BYTES || budget.bytes > MAX_IMPORT_FILE_BYTES)
        throw new Error(SIZE_ERROR);
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const data: unknown = JSON.parse(body);
    return record(record(record(data).result).data).json;
  } catch (error) {
    signal.throwIfAborted();
    if (controller.signal.aborted)
      throw new Error("Sendage took too long to respond. Please try again.", { cause: error });
    if (error instanceof TypeError)
      throw new Error(
        `Couldn't connect to Sendage. Check your connection and try again, or email ${SUPPORT_EMAIL}.`,
        { cause: error },
      );
    if (error instanceof SyntaxError) throw new Error(FORMAT_ERROR, { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    await reader?.cancel().catch(() => {});
  }
}

function readProfile(value: unknown) {
  const data = record(value);
  if (data.profile == null)
    throw new Error("That Sendage profile could not be found. Check the username or profile link.");
  const profile = record(data.profile);
  if (profile.isPrivate !== false)
    throw new Error(
      `Sendage imports need a public profile. Make your profile public, or email ${SUPPORT_EMAIL}.`,
    );
  const total = profile.totalSends;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0)
    throw new Error(FORMAT_ERROR);
  if (total > MAX_IMPORT_ROWS) throw new Error(SIZE_ERROR);
  return {
    userId: positiveInteger(profile.id),
    username: parseSendageUsername(profile.slug),
    total,
  };
}

function activitySends(value: unknown): unknown[] {
  const activity = record(value);
  if (string(activity.type) !== "sends") return [];
  if (!Array.isArray(activity.sends)) throw new Error(FORMAT_ERROR);
  return activity.sends;
}

// Cursor days must strictly decrease, or a repeated cursor would page forever.
function nextCursor(next: unknown, itemCount: number, cursor: { day: string } | null) {
  if (next == null) return null;
  const day = typeof next === "object" ? (next as Record<string, unknown>).day : undefined;
  if (
    !itemCount ||
    typeof day !== "string" ||
    !ISO_DATE_RE.test(day) ||
    (cursor && day >= cursor.day)
  )
    throw new Error(INCOMPLETE_ERROR);
  return { day };
}

function importRow(value: unknown) {
  const send = record(value);
  const style = string(send.sendType);
  if (SKIPPED_STYLES.has(style)) return null;
  if (!COMPLETED_STYLES.has(style)) throw new Error(FORMAT_ERROR);
  const climb = record(send.climb);
  const id = positiveInteger(send.id);
  positiveInteger(climb.id);
  const type = string(climb.type);
  if (!["boulder", "sport", "trad"].includes(type)) throw new Error(FORMAT_ERROR);
  const area = record(climb.area);
  if (
    typeof send.rating !== "number" ||
    !Number.isInteger(send.rating) ||
    send.rating < 0 ||
    send.rating > 5
  )
    throw new Error(FORMAT_ERROR);
  if (![-1, 0, 1].includes(Number(send.difficulty)) || typeof send.difficulty !== "number")
    throw new Error(FORMAT_ERROR);
  const date = optionalString(send.day);
  if (date && !ISO_DATE_RE.test(date)) throw new Error(FORMAT_ERROR);
  const row: Record<string, string> = {
    Date: date,
    "Send Type": style,
    Climb: string(climb.name),
    "Climb Type": type,
    Area: string(area.name),
    Region: area.parent == null ? "" : string(record(area.parent).name),
    Grade: gradeLabel(send.gradeId, type),
    "Posted Grade": gradeLabel(climb.gradeId, type),
    "Grade Feel": send.difficulty === -1 ? "low-end" : send.difficulty === 1 ? "high-end" : "solid",
    Rating: send.rating === 0 ? "" : String(send.rating),
    Comments: optionalString(send.comments),
    Beta: optionalString(send.beta),
    Attempts: send.attempts == null ? "" : String(positiveInteger(send.attempts)),
    "First Ascent": send.firstAscent === true ? "Yes" : "",
  };
  return { id, row };
}

export async function fetchSendageImport(
  input: string,
  { signal, onProgress }: { signal: AbortSignal; onProgress?: (count: number) => void },
): Promise<{ username: string; parsed: ParsedCsv }> {
  const budget = { bytes: 0 };
  const { userId, username, total } = readProfile(
    await request("user.getProfile", { username: parseSendageUsername(input) }, signal, budget),
  );
  const rows: Record<string, string>[] = [];
  const seen = new Set<number>();
  let cursor: { day: string } | null = null;
  do {
    signal.throwIfAborted();
    const page = record(
      await request(
        "activity.getUserActivity",
        cursor ? { userId, cursor } : { userId },
        signal,
        budget,
      ),
    );
    if (!Array.isArray(page.items) || page.items.length > 1000) throw new Error(FORMAT_ERROR);
    for (const send of page.items.flatMap(activitySends)) {
      const imported = importRow(send);
      if (!imported) continue;
      if (seen.has(imported.id))
        throw new Error("Your Sendage history changed during the download. Please try again.");
      seen.add(imported.id);
      rows.push(imported.row);
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(SIZE_ERROR);
    }
    onProgress?.(rows.length);
    cursor = nextCursor(page.nextCursor, page.items.length, cursor);
  } while (cursor);
  signal.throwIfAborted();
  if (!rows.length && total > 0) throw new Error(INCOMPLETE_ERROR);
  const warnings: string[] = [];
  // totalSends can count sends the activity feed leaves out.
  if (rows.length < total)
    warnings.push(
      `Sendage lists ${total} sends, but its activity feed returned ${rows.length}. Check for missing sends after importing, or email ${SUPPORT_EMAIL}.`,
    );
  if (rows.some((row) => row.Beta || row.Attempts || row["First Ascent"]))
    warnings.push(
      "Sendage beta, attempts, and first-ascent flags are available as source columns. They are not imported automatically; map a column to Comment if you want to keep it there.",
    );
  return { username, parsed: { headers: HEADERS, rows, derived: [], warnings } };
}
