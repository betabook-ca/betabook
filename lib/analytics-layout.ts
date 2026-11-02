import { z } from "zod";

import type { ClimbType } from "@/lib/grades";

/** The catalog lists everything available; a layout lists only visible items.
 * Saved layouts store these ids, so rename titles rather than ids. */
export const ANALYTICS_CARD_IDS = [
  "sends",
  "hardest",
  "days",
  /** Was "firstTry" when it counted onsights too (see renameLegacyIds). */
  "flash",
  "bestYear",
  "streak",
  "busiestMonth",
  "areas",
  "favoriteDay",
  "layoff",
  "partner",
  "biggestProject",
  "persistence",
  "favoriteRepeat",
  "onsight",
] as const;
const ANALYTICS_CHART_IDS = [
  "progression",
  "pyramid",
  "breakthroughs",
  "calendar",
  "volume",
  /** The flash chart; the id predates the separate onsight chart. */
  "flashRate",
  "onsightRate",
] as const;
const cardId = z.enum(ANALYTICS_CARD_IDS);
const chartId = z.enum(ANALYTICS_CHART_IDS);
const unique = (items: readonly string[]) => new Set(items).size === items.length;

/** Writes are strict: invalid IDs, duplicates, and extra fields are rejected. */
export const analyticsLayoutSchema = z.strictObject({
  cards: z.array(cardId).refine(unique, "Duplicate cards"),
  charts: z.array(chartId).refine(unique, "Duplicate charts"),
});
export type AnalyticsLayout = z.infer<typeof analyticsLayoutSchema>;
export type AnalyticsCardId = z.infer<typeof cardId>;
export type AnalyticsItemId = AnalyticsCardId | z.infer<typeof chartId>;
export const DEFAULT_ANALYTICS_LAYOUT: AnalyticsLayout = {
  cards: ["sends", "hardest", "days", "flash", "onsight", "bestYear"],
  charts: ["progression", "pyramid", "breakthroughs", "calendar"],
};

/** Layout for trip analytics. Leaves out the tiles and charts that compare
 * months or years, which say nothing about a few days. Onsight comes before
 * days so the share image's default first four include it on rope trips. */
export const TRIP_ANALYTICS_LAYOUT: AnalyticsLayout = {
  cards: ["sends", "hardest", "flash", "onsight", "days"],
  charts: ["pyramid"],
};

/** Whether a card or chart applies to a discipline. A boulder can't be
 * onsighted, so a boulder sent first try is always a flash. Layouts keep these
 * ids so the item stays placed for rope disciplines. */
export function itemAppliesTo(id: AnalyticsItemId, type: ClimbType): boolean {
  return type !== "boulder" || (id !== "onsight" && id !== "onsightRate");
}

/** Ids saved under an earlier name. Migration 0057 rewrites stored layouts;
 * this covers a layout read before it runs and choices kept in the browser. */
const RENAMED_IDS: Record<string, string> = { firstTry: "flash" };

/** An id list with earlier names replaced by current ones. Anything that
 * isn't an array of strings passes through for the caller to reject. */
export function renameLegacyIds(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map((id: unknown) => (typeof id === "string" ? (RENAMED_IDS[id] ?? id) : id))
    : value;
}

/** Invalid local preferences start fresh; reads and writes share one schema. */
export function parseAnalyticsLayout(value: unknown): AnalyticsLayout {
  const result = analyticsLayoutSchema.safeParse(
    value != null && typeof value === "object" && "cards" in value
      ? { ...value, cards: renameLegacyIds(value.cards) }
      : value,
  );
  return result.success ? result.data : analyticsLayoutSchema.parse(DEFAULT_ANALYTICS_LAYOUT);
}

export function moveAnalyticsItem<T extends string>(
  order: readonly T[],
  source: T,
  target: T,
  position: "before" | "after" = "before",
): T[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return [...order];
  const next = order.filter((id) => id !== source);
  next.splice(next.indexOf(target) + (position === "after" ? 1 : 0), 0, source);
  return next;
}
