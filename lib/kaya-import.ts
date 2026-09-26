import { parseGrade } from "@/lib/grades";
import {
  KAYA_MAX_RETRIES,
  KAYA_PAGE_SIZE,
  type KayaImportProgress,
  type KayaRetry,
} from "@/lib/kaya-import-stream";
import { parseKayaUsername } from "@/lib/kaya-profile";
import { readKayaStream } from "@/lib/kaya-stream-reader";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type ParsedCsv } from "@/lib/sends-import";
import { importCsvFallback, importTooLargeMessage } from "@/lib/support";

const CSV_FALLBACK = importCsvFallback("KAYA", "logbook");
const FORMAT_ERROR = `KAYA returned an unexpected format. ${CSV_FALLBACK}`;
const INCOMPLETE_ERROR = `Couldn't load your complete KAYA history, or it changed during download. Please try again. ${CSV_FALLBACK}`;
const HEADERS = [
  "Date",
  "Ascent Type",
  "Climb Name",
  "Climb Type",
  "Location",
  "Region",
  "Grade",
  "Posted Grade",
  "Stiffness",
  "Rating",
  "Comments",
];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(FORMAT_ERROR);
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error(FORMAT_ERROR);
  return value;
}
function optionalString(value: unknown): string {
  return value == null ? "" : string(value);
}
function locationName(value: unknown): string {
  return value == null ? "" : string(record(value).name);
}
function gradeLabel(value: unknown, type: string): string {
  if (value == null) return "";
  const name = string(record(value).name).trim();
  // KAYA uses explicit ungraded/intro labels; retain them for the wizard to
  // flag instead of inventing a grade. Known grades arrive in V/YDS notation.
  if (["v?", "vIntro", "?"].includes(name)) return name;
  const label = name.replace(/^v/i, "V");
  if (parseGrade(type === "1" ? "boulder" : "sport", label) === null)
    throw new Error(`KAYA returned an unknown grade. Import stopped. ${CSV_FALLBACK}`);
  return label;
}

function importDate(value: unknown): string {
  const rawDate = optionalString(value);
  let date = "";
  if (rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(rawDate))
      throw new Error(FORMAT_ERROR);
    const parsed = new Date(rawDate);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== rawDate.slice(0, 10)
    )
      throw new Error(FORMAT_ERROR);
    // KAYA's web profile displays timestamps in the viewer's local timezone.
    // Match that date, including midnight UTC imports, without a server TZ shift.
    date = rawDate.startsWith("1970-01-01")
      ? ""
      : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return date;
}

function sendFeedback(item: Record<string, unknown>) {
  const rating = item.rating;
  if (
    rating != null &&
    (typeof rating !== "number" || !Number.isInteger(rating) || rating < 0 || rating > 5)
  )
    throw new Error(FORMAT_ERROR);
  const stiffness = item.stiffness;
  if (stiffness != null && ![-1, 0, 1].includes(stiffness as number)) throw new Error(FORMAT_ERROR);
  return { rating, stiffness };
}

function importRow(item: Record<string, unknown>, expectedType: string) {
  if (item.climb === null) return null;
  const climb = record(item.climb);
  const type = string(record(climb.climb_type).id);
  // An outdoor filter alone is insufficient: reject indoor/board records and
  // require an explicit outdoor location, even if KAYA's response changes.
  if (climb.gym === undefined || climb.board === undefined) throw new Error(FORMAT_ERROR);
  if (climb.gym !== null || climb.board !== null || !["1", "2"].includes(type)) return null;
  const area = locationName(climb.area);
  const destination = locationName(climb.destination);
  if (!area && !destination) return null;
  if (type !== expectedType) throw new Error(INCOMPLETE_ERROR);
  string(climb.id);
  const name = string(climb.name);
  if (!name.trim()) throw new Error(FORMAT_ERROR);
  const { rating, stiffness } = sendFeedback(item);
  const date = importDate(item.date);
  return {
    Date: date,
    "Ascent Type": "redpoint",
    "Climb Name": name,
    "Climb Type": type === "1" ? "boulder" : "route",
    Location: area,
    Region: destination,
    Grade: gradeLabel(item.grade, type),
    "Posted Grade": gradeLabel(climb.grade, type),
    Stiffness:
      stiffness == null
        ? ""
        : stiffness === -1
          ? "low-end"
          : stiffness === 1
            ? "high-end"
            : "solid",
    Rating: rating ? String(rating) : "",
    Comments: optionalString(item.comment),
  };
}

function expectedTotal(value: unknown, previousCount: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value + previousCount > MAX_IMPORT_ROWS
  )
    throw new Error(INCOMPLETE_ERROR);
  return value;
}

function retryMessage(value: Record<string, unknown>): KayaRetry {
  if (
    typeof value.attempt !== "number" ||
    !Number.isInteger(value.attempt) ||
    value.attempt < 1 ||
    value.attempt > KAYA_MAX_RETRIES ||
    typeof value.delayMs !== "number" ||
    !Number.isFinite(value.delayMs) ||
    value.delayMs < 0 ||
    value.delayMs > 120_000 ||
    (value.reason !== "rate-limit" && value.reason !== "unavailable")
  )
    throw new Error(FORMAT_ERROR);
  return { attempt: value.attempt, retryAt: Date.now() + value.delayMs, reason: value.reason };
}

export async function fetchKayaImport(
  input: string,
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress?: (progress: KayaImportProgress) => void },
): Promise<{ username: string; parsed: ParsedCsv }> {
  let username = parseKayaUsername(input);
  const rows: Record<string, string>[] = [];
  const seen = new Set<string>();
  let excluded = 0;
  let size = 0;
  for (const type of ["1", "2"]) {
    const previousCount = seen.size;
    let received = 0;
    let total: number | null = null;
    let profileSeen = false;
    let complete = false;
    const progress = (retry: KayaRetry | null = null) =>
      onProgress?.({
        discipline: type === "1" ? "boulder" : "route",
        loaded: received,
        total,
        retry,
      });
    progress();
    const appendPage = (event: Record<string, unknown>) => {
      const count = expectedTotal(event.total, previousCount);
      if (total !== null && count !== total) throw new Error(INCOMPLETE_ERROR);
      total = count;
      if (!Array.isArray(event.items) || event.items.length > KAYA_PAGE_SIZE)
        throw new Error(FORMAT_ERROR);
      for (const itemValue of event.items) {
        const item = record(itemValue);
        const id = string(item.id);
        if (!id || seen.has(id)) throw new Error(INCOMPLETE_ERROR);
        seen.add(id);
        const row = importRow(item, type);
        if (row) rows.push(row);
        else excluded += 1;
      }
      received += event.items.length;
      if (received > total || (event.items.length < KAYA_PAGE_SIZE && received !== total))
        throw new Error(INCOMPLETE_ERROR);
      size += new TextEncoder().encode(JSON.stringify(event.items)).byteLength;
      if (size > MAX_IMPORT_FILE_BYTES)
        throw new Error(importTooLargeMessage("KAYA history", CSV_FALLBACK));
      progress();
    };
    await readKayaStream(username, type, signal, (value) => {
      const event = record(value);
      if (complete) throw new Error(INCOMPLETE_ERROR);
      switch (event.type) {
        case "heartbeat":
          return;
        case "error":
          throw new Error(string(event.error));
        case "retry":
          progress(retryMessage(event));
          return;
        case "profile":
          if (profileSeen || string(event.username).toLowerCase() !== username.toLowerCase())
            throw new Error(INCOMPLETE_ERROR);
          username = parseKayaUsername(event.username);
          profileSeen = true;
          progress();
          return;
        case "page":
          if (!profileSeen) throw new Error(INCOMPLETE_ERROR);
          appendPage(event);
          return;
        case "complete":
          if (!profileSeen || total === null || event.total !== total || received !== total)
            throw new Error(INCOMPLETE_ERROR);
          complete = true;
          return;
        default:
          throw new Error(FORMAT_ERROR);
      }
    });
    if (!complete) throw new Error(INCOMPLETE_ERROR);
  }
  signal.throwIfAborted();
  const warnings = [
    "KAYA public profiles do not expose each ascent's style. Sends are imported as redpoints only; flash and onsight styles are not preserved. Use a KAYA CSV export if you need those styles.",
    "KAYA groups sport and trad together as Routes. Route matches include both disciplines; review the selected climbs.",
  ];
  if (excluded)
    warnings.push(
      `${excluded} records were excluded because they were not supported outdoor boulders or routes, or their climbs were unavailable.`,
    );
  return { username, parsed: { headers: HEADERS, rows, derived: [], warnings } };
}
