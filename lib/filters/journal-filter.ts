import {
  appendDateFilterParams,
  parseDateFilter,
  type DateFilterValue,
} from "@/lib/filters/date-filter";
import { isValidJournalTag, normalizeTag } from "@/lib/journal";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

export const JOURNAL_VIEWS = ["all", "sessions", "training"] as const;
export type JournalView = (typeof JOURNAL_VIEWS)[number];

export type JournalFilter = DateFilterValue & {
  view: JournalView;
  query: string | null;
  tags: string[];
  friendIds: string[];
  climbId: number | null;
  year: number | null;
};

export const DEFAULT_JOURNAL_FILTER: JournalFilter = {
  view: "all",
  query: null,
  tags: [],
  friendIds: [],
  climbId: null,
  year: null,
};

export const MAX_JOURNAL_QUERY_LENGTH = 100;
const MIN_JOURNAL_YEAR = 1900;
const MAX_JOURNAL_YEAR = 2200;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_JOURNAL_QUERY_LENGTH);
}

export function parseJournalFilter(params: UrlParamsRecord): JournalFilter {
  const rawView = toArray(params.view)[0];
  const view = (JOURNAL_VIEWS as readonly string[]).includes(rawView)
    ? (rawView as JournalView)
    : DEFAULT_JOURNAL_FILTER.view;

  const query = normalizeQuery(toArray(params.q)[0] ?? "");
  const tags = [...new Set(toArray(params.tag).map(normalizeTag).filter(isValidJournalTag))];

  const climbId = Number(toArray(params.climbId)[0]);
  const year = Number(toArray(params.year)[0]);

  return {
    ...parseDateFilter(params),
    view,
    query: query || null,
    tags,
    friendIds: [
      ...new Set(
        toArray(params.friendId)
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ],
    climbId: Number.isInteger(climbId) && climbId > 0 ? climbId : null,
    year:
      Number.isInteger(year) && year >= MIN_JOURNAL_YEAR && year <= MAX_JOURNAL_YEAR ? year : null,
  };
}

export function journalFilterToSearchParams(filter: JournalFilter): URLSearchParams {
  const params = new URLSearchParams();
  appendDateFilterParams(params, filter);
  if (filter.view !== DEFAULT_JOURNAL_FILTER.view) params.set("view", filter.view);
  if (filter.query) params.set("q", filter.query);
  for (const tag of filter.tags) params.append("tag", tag);
  if (filter.climbId) params.set("climbId", String(filter.climbId));
  for (const id of filter.friendIds) params.append("friendId", id);
  if (filter.year) params.set("year", String(filter.year));
  return params;
}
