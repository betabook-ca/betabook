import { ActionError } from "@/lib/action-result";

/** The most climbs one logged day can carry. A day is saved in one D1 batch of
 * up to three statements per climb, and a longer list is an import, not a day
 * out. */
export const MAX_DAY_ENTRIES = 25;

/** The fields one climb's row may carry: everything the single-climb form
 * posts except the date, which belongs to the day. Each climb names its own
 * tagged friends and tags; the day's only pre-fill climbs as they are added. */
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
