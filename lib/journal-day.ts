import { ActionError } from "@/lib/action-result";

/** The most climbs one logged day can carry. A day is saved in one D1 batch of
 * up to three statements per climb, and a longer list is an import, not a day
 * out. */
export const MAX_DAY_ENTRIES = 25;

/** The fields one climb's row may carry. The date and tagged friends belong to
 * the day, so a row naming its own is refused rather than quietly overridden. */
const ENTRY_FIELDS = new Set([
  "climbId",
  "sent",
  "body",
  "tag",
  "ascentStyle",
  "rating",
  "suggestedGrade",
  "gradeFeel",
  "videosChanged",
  "video",
]);

const ENTRY_FIELD = /^entry\[(\d{1,2})\]\.(\w+)$/;

const INVALID_DAY = "Invalid day entry";

function entryField(index: number, name: string) {
  return `entry[${index}].${name}`;
}

/** A queued climb's tags: the ones it will save with, and the day's tags the
 * climber took off this climb, which a later change to the day's tags leaves
 * off. */
export type DayEntryTags = { tags: string[]; declinedDayTags: string[] };

/** The day's tags changed from `previous` to `next`: a tag added to the day
 * joins every climb that hasn't declined it, and one removed from the day
 * leaves every climb. */
export function applyDayTags<T extends DayEntryTags>(
  rows: readonly T[],
  previous: readonly string[],
  next: readonly string[],
): T[] {
  const added = next.filter((tag) => !previous.includes(tag));
  const removed = new Set(previous.filter((tag) => !next.includes(tag)));
  return rows.map((row) => {
    const tags = row.tags.filter((tag) => !removed.has(tag));
    for (const tag of added) {
      if (!row.declinedDayTags.includes(tag) && !tags.includes(tag)) tags.push(tag);
    }
    return { ...row, tags };
  });
}

/** One climb's own tags changed to `next`: a day tag taken off is declined for
 * this climb, and a declined one put back is no longer declined. */
export function retagDayEntry<T extends DayEntryTags>(
  row: T,
  dayTags: readonly string[],
  next: readonly string[],
): T {
  const declined = new Set(row.declinedDayTags);
  for (const tag of dayTags) {
    if (next.includes(tag)) declined.delete(tag);
    else if (row.tags.includes(tag)) declined.add(tag);
  }
  return { ...row, tags: [...next], declinedDayTags: [...declined] };
}

/** Copies one climb's single-entry form into the day's form under its row. */
export function appendDayEntry(day: FormData, index: number, entry: FormData) {
  for (const [name, value] of entry.entries()) day.append(entryField(index, name), value);
}

/** Splits a day's form into its shared fields and one single-entry form per
 * climb, in row order. Each entry form reads like the one the single-climb
 * form posts, without the day's date and friends. */
export function readDayEntries(form: FormData): { shared: FormData; entries: FormData[] } {
  const shared = new FormData();
  const rows = new Map<number, FormData>();
  for (const [name, value] of form.entries()) {
    if (!name.startsWith("entry[")) {
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
