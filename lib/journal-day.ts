import { ActionError } from "@/lib/action-result";

/** The most climbs one logged day can carry. A day is saved in one D1 batch of
 * up to three statements per climb, and a longer list is an import, not a day
 * out. */
export const MAX_DAY_ENTRIES = 25;

/** The fields one climb's row may carry: everything the single-climb form
 * posts except the date, which belongs to the day. Each climb names its own
 * tagged friends and tags; the day's only pre-fill them. */
const ENTRY_FIELDS = new Set([
  "climbId",
  "sent",
  "body",
  "tag",
  "companionsChanged",
  "companion",
  "ascentStyle",
  "rating",
  "suggestedGrade",
  "gradeFeel",
  "videosChanged",
  "video",
]);

/** The fields the day itself may carry. Friends or tags at day level would be
 * ambiguous next to each climb's own, so they're refused. */
const SHARED_FIELDS = new Set(["entryDate"]);

const ENTRY_FIELD = /^entry\[(\d{1,2})\]\.(\w+)$/;

const INVALID_DAY = "Invalid day entry";

function entryField(index: number, name: string) {
  return `entry[${index}].${name}`;
}

/** A day's defaults changed from `previous` to `next`, applied to one climb's
 * own values: a default added to the day joins the climb unless it declined
 * it, and one removed from the day leaves the climb. `key` names a value. */
function applyDefaults<T>(
  own: readonly T[],
  declined: readonly string[],
  previous: readonly T[],
  next: readonly T[],
  key: (value: T) => string,
): T[] {
  const before = new Set(previous.map(key));
  const after = new Set(next.map(key));
  const values = own.filter((value) => !before.has(key(value)) || after.has(key(value)));
  for (const value of next) {
    const id = key(value);
    if (!before.has(id) && !declined.includes(id) && !values.some((at) => key(at) === id)) {
      values.push(value);
    }
  }
  return values;
}

/** One climb's own values changed to `next`: a day default taken off is
 * declined for this climb, and a declined one put back is no longer declined. */
function declineDefaults<T>(
  own: readonly T[],
  declined: readonly string[],
  defaults: readonly T[],
  next: readonly T[],
  key: (value: T) => string,
): string[] {
  const result = new Set(declined);
  const kept = new Set(next.map(key));
  const had = new Set(own.map(key));
  for (const id of defaults.map(key)) {
    if (kept.has(id)) result.delete(id);
    else if (had.has(id)) result.add(id);
  }
  return [...result];
}

const tagKey = (tag: string) => tag;
const friendKey = (friend: { id: string }) => friend.id;

/** A queued climb's tags: the ones it will save with, and the day's tags the
 * climber took off this climb, which a later change to the day's tags leaves
 * off. */
export type DayEntryTags = { tags: string[]; declinedDayTags: string[] };

/** A queued climb's tagged friends, kept the same way as its tags. */
export type DayEntryFriends<F extends { id: string }> = {
  companions: F[];
  declinedDayCompanions: string[];
};

/** The day's tags changed from `previous` to `next`: a tag added to the day
 * joins every climb that hasn't declined it, and one removed from the day
 * leaves every climb. */
export function applyDayTags<T extends DayEntryTags>(
  rows: readonly T[],
  previous: readonly string[],
  next: readonly string[],
): T[] {
  return rows.map((row) => ({
    ...row,
    tags: applyDefaults(row.tags, row.declinedDayTags, previous, next, tagKey),
  }));
}

/** One climb's own tags changed to `next`: a day tag taken off is declined for
 * this climb, and a declined one put back is no longer declined. */
export function retagDayEntry<T extends DayEntryTags>(
  row: T,
  dayTags: readonly string[],
  next: readonly string[],
): T {
  return {
    ...row,
    tags: [...next],
    declinedDayTags: declineDefaults(row.tags, row.declinedDayTags, dayTags, next, tagKey),
  };
}

/** The day's friends changed: the same rules as `applyDayTags`, by friend id. */
export function applyDayCompanions<F extends { id: string }, T extends DayEntryFriends<F>>(
  rows: readonly T[],
  previous: readonly F[],
  next: readonly F[],
): T[] {
  return rows.map((row) => ({
    ...row,
    companions: applyDefaults(row.companions, row.declinedDayCompanions, previous, next, friendKey),
  }));
}

/** One climb's own friends changed: the same rules as `retagDayEntry`. */
export function retagDayCompanions<F extends { id: string }, T extends DayEntryFriends<F>>(
  row: T,
  dayCompanions: readonly F[],
  next: readonly F[],
): T {
  return {
    ...row,
    companions: [...next],
    declinedDayCompanions: declineDefaults(
      row.companions,
      row.declinedDayCompanions,
      dayCompanions,
      next,
      friendKey,
    ),
  };
}

/** Copies one climb's single-entry form into the day's form under its row. */
export function appendDayEntry(day: FormData, index: number, entry: FormData) {
  for (const [name, value] of entry.entries()) day.append(entryField(index, name), value);
}

/** Splits a day's form into its shared fields and one single-entry form per
 * climb, in row order. Each entry form reads like the one the single-climb
 * form posts, without the day's date. */
export function readDayEntries(form: FormData): { shared: FormData; entries: FormData[] } {
  const shared = new FormData();
  const rows = new Map<number, FormData>();
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("entry[")) {
      if (!SHARED_FIELDS.has(name)) throw new ActionError(INVALID_DAY);
      shared.append(name, value);
      continue;
    }
    const match = ENTRY_FIELD.exec(name);
    if (!match || !ENTRY_FIELDS.has(match[2])) throw new ActionError(INVALID_DAY);
    const index = Number(match[1]);
    if (index >= MAX_DAY_ENTRIES) throw new ActionError(INVALID_DAY);
    const row = rows.get(index) ?? new FormData();
    row.append(match[2], value);
    rows.set(index, row);
  }

  if (rows.size === 0) throw new ActionError("Add a climb to log this day");
  const entries = Array.from({ length: rows.size }, (_, index) => rows.get(index));
  if (entries.some((entry) => entry === undefined)) throw new ActionError(INVALID_DAY);
  return { shared, entries: entries as FormData[] };
}
