import { isClimbType, type Discipline } from "@/lib/grades";
import { parseId } from "@/lib/parse-id";
import { ASCENT_STYLES, type AscentStyle } from "@/lib/sends";

export type UrlParamsRecord = Record<string, string | string[] | undefined>;

export function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function toRange(
  value: string | string[] | undefined,
  fallback: [number, number],
): [number, number] {
  const values = toArray(value).map(Number).filter(Number.isFinite);
  if (values.length < 2) return fallback;
  return [Math.min(...values), Math.max(...values)];
}

export function parseDisciplines(params: UrlParamsRecord): Discipline[] {
  return toArray(params.discipline).filter(isClimbType);
}

export function parseAscentStyles(params: UrlParamsRecord): AscentStyle[] {
  return toArray(params.ascentStyle).filter((s): s is AscentStyle =>
    (ASCENT_STYLES as readonly string[]).includes(s),
  );
}
export const DEFAULT_SUGGESTION_LIMIT = 5;

/** Flattens a URLSearchParams into the UrlParamsRecord shape the parse*
 * helpers above expect — used by the "load more" API routes, which receive
 * a real URLSearchParams rather than Next's already-parsed searchParams. */
export function searchParamsToRecord(searchParams: URLSearchParams): UrlParamsRecord {
  const record: UrlParamsRecord = {};
  for (const key of searchParams.keys()) {
    record[key] = searchParams.getAll(key);
  }
  return record;
}
/** Absent means global; an invalid explicit identity matches no area, never everything. */
export function parseAreaId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return parseId(value) ?? 0;
}
