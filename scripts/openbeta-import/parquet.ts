// Phase 0/1: parse an OpenBeta parquet export and map its rows onto
// OpenBetaClimbRow (types.ts).
//
// Schema confirmed against the real OpenBeta/parquet-exporter project
// (github.com/OpenBeta/parquet-exporter, schema.sql as of its 2026-09-06
// release): the default export is a SINGLE flat table, one row per route,
// with the area hierarchy denormalized onto each row as text breadcrumb
// columns (country/state_province/region/area/crag) rather than a separate
// area-entity table with its own uuids and parent links. That's why this
// pipeline synthesizes area nodes from breadcrumbs (breadcrumbs.ts) instead
// of reading them as their own rows.
//
// The exporter's schema.sql is user-customizable (its own README documents
// "Minimal", "Extended", and "USA Sport Routes Only" variants), so an actual
// input file may add or drop columns from what's mapped below. FIELD_CANDIDATES
// tries several names per logical field for exactly that reason; run
// `inspectParquetSchema` against the real file being used and extend the
// tables below if a needed column isn't recognized. Un-mappable rows are
// skipped with a reason rather than guessed at, so a schema drift fails safe
// (an OpenBeta route silently isn't imported) rather than importing
// corrupted data.
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";

import type { OpenBetaClimbRow } from "./types.ts";

export async function readParquetRows(filePath: string): Promise<Record<string, unknown>[]> {
  const file = await asyncBufferFromFile(filePath);
  const rows = await parquetReadObjects({ file });
  return rows as Record<string, unknown>[];
}

/** Every column name this mapping layer will try, per logical field, in
 * order. First match wins. Primary names match schema.sql's actual output
 * columns; later entries are guesses at other schema.sql variants. */
const CLIMB_FIELD_CANDIDATES = {
  uuid: ["climb_id", "uuid", "id"],
  name: ["climb_name", "name"],
  latitude: ["latitude", "lat", "metadata_lat"],
  longitude: ["longitude", "lng", "lon", "metadata_lng"],
} as const;

/** schema.sql's five pathTokens levels, root-first. A route need not have
 * every level populated (e.g. no named sub-region) — absent/blank segments
 * are dropped rather than becoming a hollow path element. */
const BREADCRUMB_COLUMNS = ["country", "state_province", "region", "area", "crag"] as const;

/** schema.sql's boolean discipline columns. is_alpine/is_top_rope have no
 * Betabook bucket and are recognized (so a route carrying only those is
 * correctly seen as "no supported discipline") without being mapped to one. */
const DISCIPLINE_FLAG_COLUMNS: Record<string, string> = {
  is_sport: "sport",
  is_trad: "trad",
  is_boulder: "boulder",
  is_bouldering: "boulder",
  is_alpine: "alpine",
  is_top_rope: "tr",
  is_tr: "tr",
};

function firstDefined(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractBreadcrumb(raw: Record<string, unknown>): string[] {
  // Falls back to a single flattened "path_tokens" array/string column if the
  // five discrete country/state_province/region/area/crag columns aren't
  // present — another plausible schema.sql shape.
  const discrete = BREADCRUMB_COLUMNS.map((col) => asString(raw[col])).filter(
    (v): v is string => v !== null,
  );
  if (discrete.length > 0) return discrete;

  const flattened = firstDefined(raw, ["path_tokens", "pathTokens"]);
  if (Array.isArray(flattened)) {
    return flattened.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  }
  return [];
}

function extractDisciplines(raw: Record<string, unknown>): string[] {
  const direct = firstDefined(raw, ["disciplines", "type", "types"]);
  if (Array.isArray(direct)) {
    return direct.filter((v): v is string => typeof v === "string");
  }
  if (typeof direct === "string") {
    return direct
      .split(/[,|]/)
      .map((v) => v.trim())
      .filter((v) => v !== "");
  }

  const disciplines: string[] = [];
  for (const [column, discipline] of Object.entries(DISCIPLINE_FLAG_COLUMNS)) {
    if (raw[column] === true) disciplines.push(discipline);
  }
  return disciplines;
}

function extractGrades(raw: Record<string, unknown>): Record<string, string> {
  const gradesField = raw.grades;
  if (gradesField && typeof gradesField === "object" && !Array.isArray(gradesField)) {
    const entries = Object.entries(gradesField as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "",
    );
    return Object.fromEntries(entries);
  }
  // schema.sql's actual flattened output: grade_yds/grade_vscale/grade_french.
  const grades: Record<string, string> = {};
  for (const scale of ["yds", "vscale", "french", "font", "uiaa"]) {
    const value = asString(raw[`grade_${scale}`]);
    if (value) grades[scale] = value;
  }
  return grades;
}

export type MapResult<T> = { row: T } | { skipped: true; reason: string };

/** The uuid a route's crag-level area resolves to is the joined breadcrumb
 * itself (see breadcrumbs.ts) — this export has no separate area uuid to
 * carry as parentAreaUuid, so mapOpenBetaClimbRow computes it here rather
 * than reading a column. */
export function mapOpenBetaClimbRow(raw: Record<string, unknown>): MapResult<OpenBetaClimbRow> {
  const uuid = asString(firstDefined(raw, CLIMB_FIELD_CANDIDATES.uuid));
  if (!uuid) return { skipped: true, reason: "no recognizable uuid column" };
  const name = asString(firstDefined(raw, CLIMB_FIELD_CANDIDATES.name));
  if (!name) return { skipped: true, reason: `climb ${uuid} has no recognizable name column` };
  const breadcrumb = extractBreadcrumb(raw);
  if (breadcrumb.length === 0) {
    return {
      skipped: true,
      reason: `climb ${uuid} ("${name}") has no recognizable location breadcrumb`,
    };
  }

  return {
    row: {
      uuid,
      name,
      breadcrumb,
      disciplines: extractDisciplines(raw),
      grades: extractGrades(raw),
      latitude: asNumber(firstDefined(raw, CLIMB_FIELD_CANDIDATES.latitude)),
      longitude: asNumber(firstDefined(raw, CLIMB_FIELD_CANDIDATES.longitude)),
    },
  };
}

export type SkippedRow = { index: number; reason: string };

export function mapOpenBetaClimbRows(rows: readonly Record<string, unknown>[]): {
  rows: OpenBetaClimbRow[];
  skipped: SkippedRow[];
} {
  const mapped: OpenBetaClimbRow[] = [];
  const skipped: SkippedRow[] = [];
  for (const [index, raw] of rows.entries()) {
    const result = mapOpenBetaClimbRow(raw);
    if ("row" in result) mapped.push(result.row);
    else skipped.push({ index, reason: result.reason });
  }
  return { rows: mapped, skipped };
}

/** Phase 0 helper: prints the real column names of a parquet file so
 * CLIMB_FIELD_CANDIDATES/BREADCRUMB_COLUMNS/DISCIPLINE_FLAG_COLUMNS above can
 * be corrected against the actual schema.sql variant a given export used.
 * Run this before trusting any mapped row from a new source file. */
export async function inspectParquetSchema(filePath: string): Promise<string[]> {
  const rows = await readParquetRows(filePath);
  const keys = new Set<string>();
  for (const row of rows.slice(0, 50)) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys].sort();
}
