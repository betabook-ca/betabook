import { z } from "zod";

/** The catalog lists everything available; a layout lists only visible items.
 * Saved layouts store these ids, so rename titles rather than ids. */
export const ANALYTICS_CARD_IDS = [
  "sends",
  "hardest",
  "days",
  "firstTry",
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
] as const;
const ANALYTICS_CHART_IDS = [
  "progression",
  "pyramid",
  "breakthroughs",
  "calendar",
  "volume",
  "flashRate",
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
  cards: ["sends", "hardest", "days", "firstTry", "bestYear"],
  charts: ["progression", "pyramid", "breakthroughs", "calendar"],
};

/** Invalid local preferences start fresh; reads and writes share one schema. */
export function parseAnalyticsLayout(value: unknown): AnalyticsLayout {
  const result = analyticsLayoutSchema.safeParse(value);
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
