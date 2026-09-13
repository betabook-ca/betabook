import { format as formatDate, isValid, parse } from "date-fns";
import Papa from "papaparse";

import { parseGrade, type ClimbType } from "@/lib/grades";
import { decodeHtmlEntities } from "@/lib/html-entities";
import {
  ASCENT_STYLES,
  GRADE_FEEL_VALUES,
  MAX_COMMENT_LENGTH,
  latestAcceptableSendDate,
  type AscentStyle,
  type GradeFeel,
} from "@/lib/sends";
import { CSV_UNPARSE_CONFIG } from "@/lib/sends-export";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  /** Parser diagnostics and duplicate-header renames shown before column mapping. */
  warnings: string[];
  /** Computed columns available for mapping, excluded from headers so exports
   * retain the source file's columns. */
  derived: string[];
};

export const CLIMB_TYPES = ["boulder", "sport", "trad"] as const;
/** Check bytes before reading/parsing to bound memory. The row cap is checked
 * after parsing and only limits what reaches the wizard. */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

function countValues(rows: Record<string, string>[], column: string | null): Map<string, number> {
  const counts = new Map<string, number>();
  if (!column) return counts;
  for (const row of rows) {
    const value = (row[column] ?? "").trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export function distinctValues(rows: Record<string, string>[], column: string | null): string[] {
  return [...countValues(rows, column).keys()];
}

/** Distinct nonblank values and counts, most frequent first. */
export function valueCounts(
  rows: Record<string, string>[],
  column: string | null,
): { value: string; count: number }[] {
  return [...countValues(rows, column)]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

const MAX_PARSE_ERROR_WARNINGS = 5;

/** Skip export preambles by treating the first row with the modal column count
 * as the header. This is a heuristic, not a CSV format guarantee. */
export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const warnings: string[] = [];

  // Papa Parse uses this warning when an empty or single-column file defaults to commas.
  const parseErrors = result.errors.filter((e) => e.code !== "UndetectableDelimiter");
  for (const err of parseErrors.slice(0, MAX_PARSE_ERROR_WARNINGS)) {
    warnings.push(err.row != null ? `Row ${err.row + 1}: ${err.message}` : err.message);
  }
  if (parseErrors.length > MAX_PARSE_ERROR_WARNINGS) {
    warnings.push(`…and ${parseErrors.length - MAX_PARSE_ERROR_WARNINGS} more parse issues`);
  }

  const rawRows = result.data;
  if (rawRows.length === 0) return { headers: [], rows: [], warnings, derived: [] };

  const lengthCounts = new Map<number, number>();
  for (const r of rawRows) {
    lengthCounts.set(r.length, (lengthCounts.get(r.length) ?? 0) + 1);
  }
  let modeLength = rawRows[0].length;
  let modeCount = -1;
  for (const [length, count] of lengthCounts) {
    if (count > modeCount) {
      modeCount = count;
      modeLength = length;
    }
  }

  const headerIndex = rawRows.findIndex((r) => r.length === modeLength);
  const rawHeaders = rawRows[headerIndex] ?? [];

  // Rename duplicate headers to prevent lost cells and duplicate React keys.
  const used = new Set<string>();
  const headers = rawHeaders.map((header) => {
    if (!used.has(header)) {
      used.add(header);
      return header;
    }
    let n = 2;
    let renamed = `${header} (${n})`;
    while (used.has(renamed) || rawHeaders.includes(renamed)) {
      n += 1;
      renamed = `${header} (${n})`;
    }
    used.add(renamed);
    warnings.push(`Duplicate column "${header}" renamed to "${renamed}"`);
    return renamed;
  });

  const rows = rawRows.slice(headerIndex + 1).map((r) => {
    const row: Record<string, string> = {};
    for (const [i, h] of headers.entries()) {
      row[h] = r[i] ?? "";
    }
    return row;
  });

  return { headers, rows, warnings, derived: [] };
}

export type ColumnMapping = {
  date: string | null;
  ascentStyle: string | null;
  climbName: string | null;
  /** Optional exact area constraint, matching the climb's area or an ancestor. */
  areaName: string | null;
  /** Soft location signals: unmatched hints do not disqualify a candidate. */
  areaHints: string[];
  climbType: string | null; // Optional discipline constraint.
  grade: string | null;
  suggestedGrade: string | null; // optional — takes precedence over `grade` for the send's suggested grade
  gradeFeel: string | null;
  rating: string | null;
  comment: string | null;
};

export type FieldKey = Exclude<keyof ColumnMapping, "areaHints">;

export const REQUIRED_COLUMN_KEYS: readonly FieldKey[] = ["ascentStyle", "climbName"];

export function missingRequiredColumns(mapping: ColumnMapping): FieldKey[] {
  return REQUIRED_COLUMN_KEYS.filter((key) => !mapping[key]);
}

// Claim specific fields before generic aliases such as ascentStyle's "type".
const FIELD_ORDER: FieldKey[] = [
  "date",
  "climbType",
  "ascentStyle",
  "climbName",
  "areaName",
  "suggestedGrade",
  "grade",
  "gradeFeel",
  "rating",
  "comment",
];

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  date: ["date sent", "send date", "ascent date", "date"],
  climbType: ["climb type", "discipline"],
  ascentStyle: [
    "send type",
    "ascent type",
    "ascent style",
    "completion type",
    "tick type",
    "style",
    "type",
  ],
  climbName: ["climb name", "route name", "problem name", "climb", "route", "problem", "name"],
  areaName: ["area name", "area", "crag", "location", "sector"],
  // A lone third-party grade maps to suggestedGrade. A separate posted Grade
  // is claimed only after a more specific suggested-grade column.
  suggestedGrade: ["suggested grade", "personal grade", "my grade", "grade", "difficulty"],
  grade: ["posted grade", "climb grade", "route grade", "guidebook grade", "grade"],
  gradeFeel: ["grade feel", "stiffness", "feel"],
  rating: ["rating", "your stars", "stars"],
  comment: ["comments", "comment", "notes"],
};

const HINT_ALIASES = ["country", "state", "province", "region"];

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export type ImportSource = "betabook" | "kaya" | "sendage" | "mountainproject" | "unknown";

export const IMPORT_SOURCE_LABELS: Record<ImportSource, string> = {
  betabook: "betabook export",
  kaya: "KAYA export",
  sendage: "Sendage export",
  mountainproject: "Mountain Project export",
  unknown: "CSV",
};

/** Identify exports by a subset of headers so additional columns do not break detection. */
const SOURCE_SIGNATURES: Record<Exclude<ImportSource, "unknown">, string[]> = {
  betabook: ["date sent", "ascent style", "climb name", "area name"],
  kaya: ["ascent type", "climb name", "stiffness"],
  sendage: ["send type", "climb", "climb type", "area"],
  mountainproject: ["route", "lead style", "route type", "your stars"],
};

/** Mountain Project splits ascent style between Lead Style and Style;
 * use Lead Style when nonblank and Style otherwise. */
export const MP_ASCENT_COLUMN = "Lead Style or Style";

export function deriveSourceColumns(parsed: ParsedCsv, source: ImportSource): ParsedCsv {
  if (source !== "mountainproject") return parsed;
  const find = (name: string) => parsed.headers.find((h) => normalizeHeader(h) === name);
  const leadStyle = find("lead style");
  const style = find("style");
  if (
    !leadStyle ||
    !style ||
    parsed.headers.includes(MP_ASCENT_COLUMN) ||
    parsed.derived.includes(MP_ASCENT_COLUMN)
  ) {
    return parsed;
  }
  return {
    ...parsed,
    derived: [...parsed.derived, MP_ASCENT_COLUMN],
    rows: parsed.rows.map((row) => ({
      ...row,
      [MP_ASCENT_COLUMN]: (row[leadStyle] ?? "").trim() || (row[style] ?? "").trim(),
    })),
  };
}

export function detectImportSource(headers: string[]): ImportSource {
  const normalized = new Set(headers.map(normalizeHeader));
  for (const [source, signature] of Object.entries(SOURCE_SIGNATURES)) {
    if (signature.every((h) => normalized.has(h))) return source as ImportSource;
  }
  return "unknown";
}

function emptyMapping(): ColumnMapping {
  return {
    date: null,
    ascentStyle: null,
    climbName: null,
    areaName: null,
    areaHints: [],
    climbType: null,
    grade: null,
    suggestedGrade: null,
    gradeFeel: null,
    rating: null,
    comment: null,
  };
}

/** Apply source presets before generic aliases. Include derived columns in headers.
 * Mountain Project uses Rating for route grade and Your Stars for star rating. */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  const source = detectImportSource(headers);

  const claimed = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const claim = (norm: string): string | null => {
    const match = normalized.find((h) => !claimed.has(h.raw) && h.norm === norm);
    if (!match) return null;
    claimed.add(match.raw);
    return match.raw;
  };

  if (source === "kaya") {
    // Claim KAYA location as a hint before generic aliases treat it as an exact area.
    mapping.areaHints = ["location", "country"].flatMap((h) => claim(h) ?? []);
  }

  if (source === "mountainproject") {
    mapping.ascentStyle = claim(normalizeHeader(MP_ASCENT_COLUMN));
    mapping.climbType = claim("route type");
    mapping.grade = claim("rating");
    mapping.suggestedGrade = claim("your rating");
    mapping.rating = claim("your stars");
    const location = claim("location");
    mapping.areaHints = location ? [location] : [];
  }

  for (const field of FIELD_ORDER) {
    // Do not overwrite source presets with generic aliases.
    if (mapping[field]) continue;
    for (const alias of HEADER_ALIASES[field]) {
      const raw = claim(alias);
      if (raw) {
        mapping[field] = raw;
        break;
      }
    }
  }

  for (const alias of HINT_ALIASES) {
    const raw = claim(alias);
    if (raw) mapping.areaHints.push(raw);
  }

  return mapping;
}

/** Disambiguates numeric dates such as 05/06/2019; other date shapes ignore this choice. */
export type DateFormat = "iso" | "mdy" | "dmy";

/** Try year-first and named-month formats regardless of the selected numeric order.
 * Abbreviated and full month names need separate patterns. */
const UNAMBIGUOUS_FORMATS = [
  "yyyy-MM-dd", // ISO 8601, and what an ISO timestamp reduces to once its time part is stripped
  "yyyy/MM/dd",
  "yyyy.MM.dd",
  "yyyyMMdd", // ISO 8601 basic
  "EEE MMM d yyyy", // JS Date#toString: "Tue Oct 15 2019 00:00:00 GMT+0000 (GMT+00:00)"
  "EEE, MMM d yyyy", // the same with the weekday punctuated: "Tue, Oct 15 2019"
  "EEE, d MMM yyyy", // RFC 1123 / Date#toUTCString: "Tue, 15 Oct 2019 00:00:00 GMT"
  "MMMM d, yyyy", // "October 15, 2019"
  "MMM d, yyyy", // "Oct 15, 2019"
  "MMMM d yyyy",
  "MMM d yyyy",
  "d MMMM yyyy", // "15 October 2019"
  "d MMM yyyy",
  "d-MMM-yyyy", // "15-Oct-2019" — Excel's default rendering of a text date
  "MMM-d-yyyy",
];

/** date-fns resolves two-digit years relative to REFERENCE_DATE. */
const AMBIGUOUS_FORMATS: Record<DateFormat, string[]> = {
  iso: [],
  mdy: ["M/d/yyyy", "M-d-yyyy", "M.d.yyyy", "M/d/yy", "M-d-yy", "M.d.yy"],
  dmy: ["d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d/M/yy", "d-M-yy", "d.M.yy"],
};

// Parenthesized timezone names from Date.toString(), such as (Pacific Daylight Time).
const TZ_NAME_RE = /\s*\([^)]*\)\s*$/;

// Strip timezone offsets only with a time, so -2019 in 15-Oct-2019 is not removed.
const TIME_RE =
  /[T\s]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[AP]\.?M\.?)?\s*(?:(?:GMT|UTC|UT)?\s*(?:Z|[+-]\d{1,2}:?\d{2})?)\s*$/i;

/** Preserve the written calendar date; converting the timestamp to UTC could change the send day. */
function stripTimeSuffix(value: string): string {
  return value.replace(TZ_NAME_RE, "").replace(TIME_RE, "").trim();
}

// Normalize Sept to the Sep spelling expected by date-fns.
const SEPT_RE = /\bSept\b/gi;

// A fixed reference keeps parsing, including two-digit year resolution, independent of the clock.
const REFERENCE_DATE = new Date(2000, 0, 1);

/** Returns an ISO YYYY-MM-DD string, or null if unparseable/blank under the given format. */
export function parseDateWithFormat(raw: string, format: DateFormat): string | null {
  const trimmed = stripTimeSuffix(raw.trim()).replace(SEPT_RE, "Sep");
  if (!trimmed) return null;

  for (const pattern of [...UNAMBIGUOUS_FORMATS, ...AMBIGUOUS_FORMATS[format]]) {
    const parsed = parse(trimmed, pattern, REFERENCE_DATE);
    if (isValid(parsed) && isPlausibleYear(parsed)) return formatDate(parsed, "yyyy-MM-dd");
  }

  return null;
}

// Reject short years misread by yyyy, letting 10/15/19 fall through to M/d/yy.
function isPlausibleYear(date: Date): boolean {
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
}

/** Bound format detection work by sampling distinct date values. */
export const DATE_SAMPLE_SIZE = 25;

/** Ask only when month-first and day-first parsing produce different valid dates. */
export function needsDateFormatChoice(sampleValues: string[]): boolean {
  return sampleValues.some((value) => {
    if (!value.trim()) return false;
    const asMdy = parseDateWithFormat(value, "mdy");
    const asDmy = parseDateWithFormat(value, "dmy");
    return asMdy !== null && asDmy !== null && asMdy !== asDmy;
  });
}

/** Choose the format that parses the most samples; ties favor iso. */
export function detectDateFormat(sampleValues: string[]): DateFormat {
  const candidates: DateFormat[] = ["iso", "mdy", "dmy"];
  let best: DateFormat = "iso";
  let bestScore = -1;

  for (const format of candidates) {
    const score = sampleValues.filter(
      (v) => v.trim() && parseDateWithFormat(v, format) !== null,
    ).length;
    if (score > bestScore) {
      bestScore = score;
      best = format;
    }
  }

  return best;
}

const NON_MIDNIGHT_TIME_RE = /\b(?!00:00(?::00)?\b)\d{1,2}:\d{2}(?::\d{2})?\b/;

/** Repeated non-midnight timestamps may be export-time placeholders for undated sends.
 * Return candidates for user review; repetition does not prove a date is a placeholder. */
export function findPlaceholderTimestamps(
  rows: Record<string, string>[],
  dateColumn: string | null,
): { value: string; count: number }[] {
  return valueCounts(rows, dateColumn).filter(
    ({ value, count }) => count >= 2 && NON_MIDNIGHT_TIME_RE.test(value),
  );
}

export type AscentStyleMapping = Record<string, AscentStyle | "skip">;
type ImportClimbType = ClimbType | "route";
export type ClimbTypeMapping = Record<string, ImportClimbType | "skip">;
export type GradeFeelMapping = Record<string, GradeFeel | "skip">;

// Map common send styles; attempts, top ropes, and follows stay unmapped for review.
const ASCENT_STYLE_ALIASES: Record<string, AscentStyle> = {
  "red point": "redpoint",
  pinkpoint: "redpoint",
  "pink point": "redpoint",
  send: "redpoint",
  lead: "redpoint",
  "on sight": "onsight",
  "on-sight": "onsight",
};

/** Unknown styles default to skip until the user maps them. */
export function guessAscentStyleMapping(values: string[]): AscentStyleMapping {
  const mapping: AscentStyleMapping = {};
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    const match = ASCENT_STYLES.find((t) => t === normalized) ?? ASCENT_STYLE_ALIASES[normalized];
    mapping[value] = match ?? "skip";
  }
  return mapping;
}

const CLIMB_TYPE_ALIASES: Record<string, ImportClimbType> = {
  route: "route",
  routes: "route",
  bouldering: "boulder",
  traditional: "trad",
};

/** For mixed types such as Trad, Sport, use the first recognized discipline. */
export function guessClimbTypeMapping(values: string[]): ClimbTypeMapping {
  const mapping: ClimbTypeMapping = {};
  for (const value of values) {
    let match: ImportClimbType | undefined;
    for (const token of value.toLowerCase().split(/\s*[,/]\s*/)) {
      const trimmed = token.trim();
      match = CLIMB_TYPES.find((t) => t === trimmed) ?? CLIMB_TYPE_ALIASES[trimmed];
      if (match) break;
    }
    mapping[value] = match ?? "skip";
  }
  return mapping;
}

// Mountain Project appends a protection rating to some route grades
// ("5.9 R", "5.10c PG13"); it says nothing about difficulty.
const PROTECTION_SUFFIX_RE = /\s+(?:PG-?13|R|X)$/i;

function cleanGradeText(raw: string): string | null {
  return raw.replace(PROTECTION_SUFFIX_RE, "").trim() || null;
}

export type GradeScale = "native" | "converted";

/** Choose the grade scale that parses more values; ties favor native. */
export function detectGradeScale(values: string[]): GradeScale {
  let native = 0;
  let converted = 0;
  for (const value of values) {
    const text = cleanGradeText(value);
    if (!text) continue;
    if (parseGrade("boulder", text) !== null || parseGrade("sport", text) !== null) native += 1;
    if (
      parseGrade("boulder", text, "converted") !== null ||
      parseGrade("sport", text, "converted") !== null
    ) {
      converted += 1;
    }
  }
  return converted > native ? "converted" : "native";
}

const AREA_PATH_SEPARATOR_RE = /\s+>\s+/;

/** Split location paths leaf-first so specific hints are tried before broad regions. */
export function splitAreaHint(value: string): string[] {
  return value
    .split(AREA_PATH_SEPARATOR_RE)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .toReversed();
}

// KAYA stiffness uses negative for soft and positive for stiff. Ambiguous
// words such as sandbagged are left for manual mapping.
const GRADE_FEEL_ALIASES: Record<string, GradeFeel> = {
  soft: "low",
  easy: "low",
  fair: "solid",
  accurate: "solid",
  stiff: "high",
  hard: "high",
  "-1": "low",
  "0": "solid",
  "1": "high",
};

/** Unmapped grade feel defaults to solid without invalidating the row. */
export function guessGradeFeelMapping(values: string[]): GradeFeelMapping {
  const mapping: GradeFeelMapping = {};
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    const match = GRADE_FEEL_VALUES.find((t) => t === normalized) ?? GRADE_FEEL_ALIASES[normalized];
    mapping[value] = match ?? "skip";
  }
  return mapping;
}

export type NormalizedImportRow = {
  /** Index into ParsedCsv.rows — the wizard keys per-row decisions by it. */
  rowIndex: number;
  climbName: string;
  areaName: string | null;
  /** Soft location hints in mapped-column order, with paths expanded leaf-first. */
  areaHints: string[];
  climbTypeHint: ImportClimbType | null; // A mapped discipline constrains matching.
  ascentStyle: AscentStyle;
  dateSent: string | null; // ISO if present; blank in the CSV -> null, not a failure
  rating: number | null;
  comment: string | null; // truncated to MAX_COMMENT_LENGTH here, not rejected
  /** Suggested-grade text; falls back to the Grade column only if no Suggested Grade is mapped. */
  gradeText: string | null;
  /** A blank mapped Suggested Grade means no suggestion. With only Grade mapped,
   * a blank falls back to the climb's posted grade. Preserve this distinction on export/import. */
  blankGradeMeans: "posted-grade" | "no-suggestion";
  /** Posted grade from the source, preferred over the climber's grade for matching. */
  postedGradeText: string | null;
  gradeFeel: GradeFeel; // optional CSV column; defaults to "solid" if absent/unrecognized
  raw: Record<string, string>; // the original CSV row, kept for a failed-rows export identical to the source
};

export type InvalidImportRow = {
  rowIndex: number;
  raw: Record<string, string>;
  reason: string;
};

/** Lossy adjustments reported for rows that remain valid. */
export type CoercionWarning = {
  field: "suggestedGrade" | "rating" | "gradeFeel" | "comment";
  message: string;
  count: number;
  /** The first few affected rows, pre-formatted for display (e.g. `Row 4: "banana"`). */
  examples: string[];
};

const WARNING_EXAMPLE_LIMIT = 3;

const COERCION_MESSAGES: Record<CoercionWarning["field"], string> = {
  suggestedGrade: "unrecognized grade, imported without a suggested grade",
  rating: "invalid rating, imported without a rating",
  gradeFeel: 'unmapped grade feel, imported as "solid"',
  comment: `comment longer than ${MAX_COMMENT_LENGTH} characters, truncated`,
};

/** Without a resolved discipline, parsing only establishes that a grade could match.
 * The server validates against the chosen climb's scale. */
function gradeTextParses(
  text: string,
  climbTypeHint: ImportClimbType | null,
  preference: "native" | "converted",
): boolean {
  if (climbTypeHint)
    return (
      parseGrade(climbTypeHint === "route" ? "sport" : climbTypeHint, text, preference) !== null
    );
  return (
    parseGrade("boulder", text, preference) !== null ||
    parseGrade("sport", text, preference) !== null
  );
}

export type NormalizeOptions = {
  today?: string;
  gradeScalePreference?: "native" | "converted";
  /** Raw date values to read as "no date" — see findPlaceholderTimestamps. */
  undatedValues?: Iterable<string>;
};

/** Normalize CSV fields before climb matching; return invalid rows and
 * warnings for lossy adjustments to otherwise valid rows. */
// oxlint-disable-next-line complexity -- one coercion + validation branch per mapped CSV column
export function normalizeImportRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  ascentStyleMapping: AscentStyleMapping,
  climbTypeMapping: ClimbTypeMapping,
  gradeFeelMapping: GradeFeelMapping,
  dateFormat: DateFormat,
  options: NormalizeOptions = {},
): { valid: NormalizedImportRow[]; invalid: InvalidImportRow[]; warnings: CoercionWarning[] } {
  const {
    today = new Date().toISOString().slice(0, 10),
    gradeScalePreference = "native",
    undatedValues = [],
  } = options;
  const undated = new Set(undatedValues);
  const valid: NormalizedImportRow[] = [];
  const invalid: InvalidImportRow[] = [];
  const latestDateSent = latestAcceptableSendDate(today);

  const warningBuckets = new Map<CoercionWarning["field"], { count: number; examples: string[] }>();
  const warn = (field: CoercionWarning["field"], rowIndex: number, example: string) => {
    const bucket = warningBuckets.get(field) ?? { count: 0, examples: [] };
    bucket.count += 1;
    if (bucket.examples.length < WARNING_EXAMPLE_LIMIT) {
      bucket.examples.push(`Row ${rowIndex + 1}: ${example}`);
    }
    warningBuckets.set(field, bucket);
  };

  for (const [rowIndex, row] of parsed.rows.entries()) {
    const fail = (reason: string) => invalid.push({ rowIndex, raw: row, reason });
    const cell = (column: string | null) => (column ? (row[column] ?? "").trim() : "");
    /** Free-text only: a value-mapped cell is a key into a mapping built from
     * the raw text, and `raw` must keep matching the source file. Trimmed
     * again after decoding, since "&nbsp;" only becomes whitespace here. */
    const textCell = (column: string | null) => decodeHtmlEntities(cell(column)).trim();

    const climbName = textCell(mapping.climbName);
    if (!climbName) {
      fail("Missing climb name");
      continue;
    }

    const areaName = textCell(mapping.areaName) || null;
    const areaHints = mapping.areaHints.flatMap((column) => splitAreaHint(textCell(column)));

    const rawAscentStyle = cell(mapping.ascentStyle);
    const mappedAscentStyle = rawAscentStyle ? ascentStyleMapping[rawAscentStyle] : undefined;
    if (!mappedAscentStyle || mappedAscentStyle === "skip") {
      fail(
        rawAscentStyle ? `Unmapped ascent style value "${rawAscentStyle}"` : "Missing ascent style",
      );
      continue;
    }

    const rawDate = cell(mapping.date);
    let dateSent: string | null = null;
    if (rawDate && !undated.has(rawDate)) {
      dateSent = parseDateWithFormat(rawDate, dateFormat);
      if (dateSent === null) {
        fail(`Unparseable date "${rawDate}"`);
        continue;
      }
      if (dateSent > latestDateSent) {
        fail(`Date "${rawDate}" is in the future`);
        continue;
      }
    }

    const rawClimbType = cell(mapping.climbType);
    const mappedClimbType = rawClimbType ? climbTypeMapping[rawClimbType] : undefined;
    const climbTypeHint: ImportClimbType | null =
      mappedClimbType && mappedClimbType !== "skip" ? mappedClimbType : null;

    const rawRating = cell(mapping.rating);
    const ratingNum = rawRating ? Number(rawRating) : null;
    const rating =
      ratingNum !== null && Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5
        ? ratingNum
        : null;
    // Zero and negative ratings represent unrated in supported exports; Mountain Project uses -1.
    if (rawRating && rating === null && !(ratingNum !== null && ratingNum <= 0)) {
      warn("rating", rowIndex, `"${rawRating}"`);
    }

    const rawComment = textCell(mapping.comment);
    if (rawComment.length > MAX_COMMENT_LENGTH) {
      warn("comment", rowIndex, `${rawComment.length} characters`);
    }
    const comment = rawComment
      ? rawComment.length > MAX_COMMENT_LENGTH
        ? rawComment.slice(0, MAX_COMMENT_LENGTH)
        : rawComment
      : null;

    const gradeColumn = mapping.suggestedGrade ?? mapping.grade;
    const blankGradeMeans = mapping.suggestedGrade
      ? ("no-suggestion" as const)
      : ("posted-grade" as const);
    const gradeText = cleanGradeText(cell(gradeColumn));
    if (gradeText && !gradeTextParses(gradeText, climbTypeHint, gradeScalePreference)) {
      warn("suggestedGrade", rowIndex, `"${gradeText}"`);
    }
    const postedGradeText = cleanGradeText(cell(mapping.grade));

    const rawGradeFeel = cell(mapping.gradeFeel);
    const mappedGradeFeel = rawGradeFeel ? gradeFeelMapping[rawGradeFeel] : undefined;
    const feelDropped = !mappedGradeFeel || mappedGradeFeel === "skip";
    const gradeFeel: GradeFeel = feelDropped ? "solid" : mappedGradeFeel;
    if (rawGradeFeel && feelDropped) warn("gradeFeel", rowIndex, `"${rawGradeFeel}"`);

    valid.push({
      rowIndex,
      climbName,
      areaName,
      areaHints,
      climbTypeHint,
      ascentStyle: mappedAscentStyle,
      dateSent,
      rating,
      comment,
      gradeText,
      blankGradeMeans,
      postedGradeText,
      gradeFeel,
      raw: row,
    });
  }

  const warnings: CoercionWarning[] = (
    ["suggestedGrade", "rating", "gradeFeel", "comment"] as const
  ).flatMap((field) => {
    const bucket = warningBuckets.get(field);
    return bucket ? [{ field, message: COERCION_MESSAGES[field], ...bucket }] : [];
  });

  return { valid, invalid, warnings };
}

/** A row needing attention, including unconfirmed import outcomes. */
export type FailedImportRow = {
  raw: Record<string, string>;
  reason: string;
};

const REASON_COLUMN = "Import Failure Reason";

/** Export original cell values plus an explanation for each row needing attention.
 * An unconfirmed outcome does not mean the row is safe to import again. */
export function buildFailedRowsCsv(headers: string[], failures: FailedImportRow[]): string {
  const fields = [...headers, REASON_COLUMN];
  const data = failures.map(({ raw, reason }) => [...headers.map((h) => raw[h] ?? ""), reason]);
  return Papa.unparse({ fields, data }, CSV_UNPARSE_CONFIG);
}
