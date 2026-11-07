import { z } from "zod";

import {
  DEFAULT_CLIMB_FILTER,
  appendClimbFilterParams,
  parseClimbFilter,
  type ClimbFilter,
} from "@/lib/filters/climb-filter";
import { toArray, type UrlParamsRecord } from "@/lib/url-params";

/** Saved climb lists: "Red River classics", "Bishop wishlist". Not the area
 * page's climb list, which is `lib/climb-list-sort.ts` and
 * `components/climb-list.tsx`. */

export const MAX_CLIMB_LIST_TITLE = 80;
/** The column's CHECK allows 5,000, so this can rise without a migration. */
export const MAX_CLIMB_LIST_DESCRIPTION = 2000;
/** Ceilings that stop a scripted client filling the tables. Both are
 * conditions on the INSERT, so concurrent requests cannot race past them. */
export const MAX_CLIMB_LISTS = 100;
export const MAX_CLIMB_LIST_ITEMS = 500;

export const CLIMB_LIST_NOT_FOUND_MESSAGE = "List not found";
/** Shown for a copy the reader may no longer make, whatever the reason: the
 * list was deleted, its owner hid their lists or went private, or the link
 * expired. Saying which would report on the owner. */
export const CLIMB_LIST_UNAVAILABLE_MESSAGE = "This list isn't available.";
export const CLIMB_LIST_LIMIT_MESSAGE = `You can keep ${MAX_CLIMB_LISTS} lists. Delete one to add another.`;
export const CLIMB_LIST_FULL_MESSAGE = `A list can hold ${MAX_CLIMB_LIST_ITEMS} climbs.`;
export const CLIMB_LIST_CHANGED_MESSAGE =
  "This list changed since you opened it. Reload to try again.";
export const CLIMB_NOT_FOUND_MESSAGE = "Climb not found";

/** Counts code points, to match SQLite's length(). */
function characters(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

export const climbListInputSchema = z.object({
  title: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Name your list.")
        .refine((value) => characters(value) <= MAX_CLIMB_LIST_TITLE, "That name is too long."),
    ),
  description: z
    .string()
    .transform((value) => value.trim())
    .refine(
      (value) => characters(value) <= MAX_CLIMB_LIST_DESCRIPTION,
      "That description is too long.",
    )
    .transform((value) => value || null)
    .nullable()
    .optional(),
});

const COPY_SUFFIX = " (copy)";

/** The name a copy starts with. Copying someone else's list keeps their name
 * as it is; copying your own adds " (copy)" so the two can be told apart,
 * trimming the original so the result still fits. */
export function copyClimbListTitle(title: string, { own }: { own: boolean }): string {
  if (!own) return title;
  const room = MAX_CLIMB_LIST_TITLE - characters(COPY_SUFFIX);
  const base = Array.from(title).slice(0, room).join("").trimEnd();
  return `${base}${COPY_SUFFIX}`;
}

const CLIMB_LIST_SORT_FIELDS = ["position", "grade", "area", "name", "added"] as const;
type ClimbListSortField = (typeof CLIMB_LIST_SORT_FIELDS)[number];
export type ClimbListSort = `${ClimbListSortField}_${"asc" | "desc"}`;

export const DEFAULT_CLIMB_LIST_SORT: ClimbListSort = "position_asc";

/** Direction a freshly picked field starts at. */
export const CLIMB_LIST_SORT_DIRECTION: Record<ClimbListSortField, "asc" | "desc"> = {
  position: "asc",
  grade: "desc",
  area: "asc",
  name: "asc",
  added: "desc",
};

export const CLIMB_LIST_SORT_OPTIONS: { id: ClimbListSortField; label: string }[] = [
  { id: "position", label: "List order" },
  { id: "grade", label: "Grade" },
  { id: "area", label: "Area" },
  { id: "name", label: "Name" },
  { id: "added", label: "Date added" },
];

/** The list's own sort, and the same filters Find climbs offers: text, area,
 * disciplines and grades, rating, ascents, and Exclude sent. */
export type ClimbListView = { sort: ClimbListSort; filter: ClimbFilter };

export const DEFAULT_CLIMB_LIST_VIEW: ClimbListView = {
  sort: DEFAULT_CLIMB_LIST_SORT,
  filter: DEFAULT_CLIMB_FILTER,
};

/** How a reader is viewing a list. Never changes the list. Unknown values fall
 * back to the defaults, as other list pages do, rather than 404ing a link
 * someone typed by hand. */
export function parseClimbListView(params: UrlParamsRecord): ClimbListView {
  const rawSort = toArray(params.sort)[0] ?? "";
  const sort = CLIMB_LIST_SORT_FIELDS.some(
    (field) => rawSort === `${field}_asc` || rawSort === `${field}_desc`,
  )
    ? (rawSort as ClimbListSort)
    : DEFAULT_CLIMB_LIST_SORT;
  return { sort, filter: parseClimbFilter(params) };
}

/** The filter part of a view's query string. Defaults are left out, so an
 * unfiltered list has none. */
function filterParams(filter: ClimbFilter): URLSearchParams {
  const params = new URLSearchParams();
  appendClimbFilterParams(params, filter);
  if (filter.ratingRange[0] === 0 && filter.ratingRange[1] === 0) params.delete("ratingRange");
  const defaults = new URLSearchParams();
  appendClimbFilterParams(defaults, DEFAULT_CLIMB_FILTER);
  for (const key of new Set(defaults.keys())) {
    if (params.getAll(key).join() === defaults.getAll(key).join()) params.delete(key);
  }
  return params;
}

/** True when any filter narrows the list, which hides some of its climbs. */
export function isFilteredClimbList(filter: ClimbFilter): boolean {
  return filterParams(filter).size > 0;
}

/** True in the owner's own order, the only view the list can be reordered in. */
export function isListOrder(sort: ClimbListSort): boolean {
  return sort === DEFAULT_CLIMB_LIST_SORT;
}

/** The view's query string, leaving defaults out so the plain list URL stays
 * plain. */
export function climbListViewSearch(view: ClimbListView): string {
  const params = filterParams(view.filter);
  if (view.sort !== DEFAULT_CLIMB_LIST_SORT) params.set("sort", view.sort);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** What a list link shows, said in the Share dialog before a link exists. The
 * shared page shows the list even when the owner's lists are Only me, so this
 * sentence has to keep covering everything on it; anything added to
 * `SharedClimbList` needs it changed first. */
export const CLIMB_LIST_SHARE_SENTENCE =
  "Anyone with the link sees this list: its name, description, climbs and grades, and your name. It works even when your lists are set to Only me.";

/** The token is the whole URL: no user id, no list id, nothing to enumerate. */
export function climbListSharePath(token: string): string {
  return `/lists/${token}`;
}

export function climbCountLabel(count: number): string {
  return `${count} ${count === 1 ? "climb" : "climbs"}`;
}

export function climbListsHref(userId: string): string {
  return `/users/${userId}/lists`;
}

export function climbListHref(userId: string, listId: number): string {
  return `/users/${userId}/lists/${listId}`;
}

/** `order` with `source` moved to just before or after `target`. Unknown ids
 * leave it unchanged. */
export function moveClimb(
  order: readonly number[],
  source: number,
  target: number,
  position: "before" | "after" = "before",
): number[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return [...order];
  const next = order.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (position === "after" ? 1 : 0), 0, source);
  return next;
}
