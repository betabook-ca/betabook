import type { Discipline } from "@/lib/grades";
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

export function parseDisciplines(params: UrlParamsRecord, key = "discipline"): Discipline[] {
  return toArray(params[key]).filter(
    (d): d is Discipline => d === "boulder" || d === "sport" || d === "trad",
  );
}

export function parseAscentStyles(params: UrlParamsRecord, key = "ascentStyle"): AscentStyle[] {
  return toArray(params[key]).filter((s): s is AscentStyle =>
    (ASCENT_STYLES as readonly string[]).includes(s),
  );
}

/** The most suggestions any typeahead may ask a search endpoint for. A cap,
 * not a default: `limit` is client-supplied, and an uncapped one would let a
 * caller turn a suggestion lookup into a full table read. */
export const MAX_SUGGESTION_LIMIT = 10;
export const DEFAULT_SUGGESTION_LIMIT = 5;

/** Reads a search endpoint's `limit`, which puts the request in *suggestion
 * mode*: it caps the rows and — because a popover row shows only a name, a
 * grade, and an area — tells the handler to skip the send-stat and
 * breadcrumb joins the paginated result lists need.
 *
 * Returns null only when absent, which is what "load more" sends. A present
 * but malformed value remains in bounded suggestion mode; otherwise a typo
 * such as `limit=abc` would accidentally enable the more expensive full-list
 * response and its stats/breadcrumb work. */
export function parseSuggestionLimit(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get("limit");
  if (raw === null) return null;
  const limit = Math.trunc(Number(raw));
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_SUGGESTION_LIMIT;
  return Math.min(limit, MAX_SUGGESTION_LIMIT);
}

/** How deep any list endpoint will paginate, in rows skipped. SQLite has no
 * way to seek to an OFFSET — it walks and discards every skipped row — so an
 * uncapped `page` makes `?page=1e9` a one-byte request that forces a full
 * index-order scan. 10,000 is well past what "load more" reaches. */
export const MAX_PAGINATION_OFFSET = 10_000;

/** Reads a 1-based `page`. Junk reads as page 1; a request beyond the scan
 * budget returns null so handlers can return an exhausted page. Saturating
 * at the maximum used to replay that same last page forever. */
export function parsePage(searchParams: URLSearchParams, pageSize: number): number | null {
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page"))) || 1);
  const lastPage = Math.floor(MAX_PAGINATION_OFFSET / pageSize) + 1;
  return page > lastPage ? null : page;
}

/** Row `offset` for the two endpoints that paginate by offset rather than
 * page number, under the same MAX_PAGINATION_OFFSET budget. Junk reads as 0;
 * a request past the budget is terminal rather than a replay of offset
 * 10,000. */
export function parseOffset(searchParams: URLSearchParams): number | null {
  const offset = Number(searchParams.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0) return 0;
  return offset > MAX_PAGINATION_OFFSET ? null : offset;
}

/** Whether another page/offset request would exceed the scan budget. Routes
 * use these to suppress `hasMore` on the final allowed response instead of
 * making the client perform one extra terminal request. */
export function pageReachesPaginationLimit(page: number, pageSize: number): boolean {
  return page * pageSize > MAX_PAGINATION_OFFSET;
}

export function offsetReachesPaginationLimit(offset: number, pageSize: number): boolean {
  return offset + pageSize > MAX_PAGINATION_OFFSET;
}

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
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : 0;
}
