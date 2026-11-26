import { z } from "zod";

import type { ClimbType } from "@/lib/grades";
import { ascentStylesFor } from "@/lib/sends";

/** The catalog lists everything available; a layout lists only visible items.
 * Saved layouts store these ids, so rename titles rather than ids. The one
 * exception, firstTry → flash, marks layouts saved while flash counted
 * onsights too, so reading one can add the onsight card (`cardList`). */
export const ANALYTICS_CARD_IDS = [
  "sends",
  "hardest",
  "days",
  /** Was "firstTry" when it counted onsights too (see RENAMED_CARD_IDS). */
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
  /** Flash and onsight rates; the id predates the onsight line. */
  "flashRate",
] as const;
/** Card ids saved under an earlier name. Stored layouts are not rewritten: a
 * migration would run before the deploy, and the previous worker's strict
 * schema would reset any layout holding a new id. The schema maps them
 * instead, so every read and save does, a tab opened before a rename can
 * still save, and so does the share image's choice kept in the browser. */
const RENAMED_CARD_IDS: Record<string, (typeof ANALYTICS_CARD_IDS)[number]> = {
  firstTry: "flash",
};
const cardId = z.preprocess(
  (id) => (typeof id === "string" ? (RENAMED_CARD_IDS[id] ?? id) : id),
  z.enum(ANALYTICS_CARD_IDS),
);
const chartId = z.enum(ANALYTICS_CHART_IDS);
const unique = (items: readonly string[]) => new Set(items).size === items.length;

/** A layout saved before the split showed one card, firstTry, counting
 * flashes and onsights. It reads as flash followed by onsight, so a rope
 * climber still sees their onsights (bouldering leaves the onsight card out). */
const cardList = z.preprocess(
  (cards) =>
    Array.isArray(cards) && cards.includes("firstTry")
      ? cards.flatMap((id: unknown) =>
          id !== "firstTry" ? [id] : cards.includes("onsight") ? ["flash"] : ["flash", "onsight"],
        )
      : cards,
  z.array(cardId).refine(unique, "Duplicate cards"),
);

/** Writes are strict: invalid IDs, duplicates, and extra fields are rejected. */
export const analyticsLayoutSchema = z.strictObject({
  cards: cardList,
  charts: z.array(chartId).refine(unique, "Duplicate charts"),
});
export type AnalyticsLayout = z.infer<typeof analyticsLayoutSchema>;
export type AnalyticsCardId = z.output<typeof cardId>;
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

/** Whether a card applies to a discipline: the onsight card only where the
 * discipline has onsights (`ascentStylesFor`), so not bouldering. Layouts keep
 * the onsight id so the card stays placed for rope disciplines. */
export function cardAppliesTo(id: AnalyticsCardId, type: ClimbType): boolean {
  return id !== "onsight" || ascentStylesFor(type).includes("onsight");
}

/** A card id under its current name, or null for anything that isn't one. */
export function parseCardId(value: unknown): AnalyticsCardId | null {
  const result = cardId.safeParse(value);
  return result.success ? result.data : null;
}

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
