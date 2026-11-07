import { z } from "zod";

import { toArray, type UrlParamsRecord } from "@/lib/url-params";

/** Saved climb lists: "Red River classics", "Bishop wishlist". Not the area
 * page's climb list, which is `lib/climb-list-sort.ts` and
 * `components/climb-list.tsx`. */

export const MAX_CLIMB_LIST_TITLE = 80;
/** The column's CHECK allows 5,000, so this can rise without a migration. */
const MAX_CLIMB_LIST_DESCRIPTION = 2000;
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

const CLIMB_LIST_SENT_FILTERS = ["all", "unsent", "sent"] as const;
type ClimbListSentFilter = (typeof CLIMB_LIST_SENT_FILTERS)[number];

export const DEFAULT_CLIMB_LIST_SORT: ClimbListSort = "position_asc";

export type ClimbListView = { sort: ClimbListSort; sent: ClimbListSentFilter };

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
  const rawSent = toArray(params.sent)[0];
  const sent = CLIMB_LIST_SENT_FILTERS.find((value) => value === rawSent) ?? "all";
  return { sort, sent };
}
