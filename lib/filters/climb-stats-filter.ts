import { toArray } from "@/lib/url-params";

/** Highest possible rating — sends.rating is validated to 1..MAX_RATING
 * (see lib/sends.ts), so no climb's avg_rating can exceed it. */
export const MAX_RATING = 5;

/** Options for every rating dropdown in the app (the min/max rating-range
 * bounds on climb search and the area page, and the user-sends min-rating
 * select) — the selected index IS the rating value, with 0 rendered as
 * "Any": a bound of 0 means "no bound on this side", not "rating 0"
 * (ratings run 1..MAX_RATING). One list for every call site so the
 * sentinel's meaning can't drift between them again. */
export const RATING_OPTIONS = ["Any", "1", "2", "3", "4", "5"];

/** [min, max] avg-rating bounds. 0 on either side is the "Any" sentinel
 * (that side is unbounded — see RATING_OPTIONS); a max of MAX_RATING is
 * also unbounded, since no average rating can exceed it. Legacy zero bounds display as the full 1–5 range in the shared rating control. */
export const DEFAULT_RATING_RANGE: [number, number] = [0, 0];

export const DEFAULT_MIN_ASCENTS = 0;

/** Parses a `?ratingRange=min&ratingRange=max` pair, clamping each bound
 * onto the 0..MAX_RATING scale (0 = "Any") so a hand-edited URL can't put
 * the rating bounds in an unrepresentable state. Shared by climb search
 * and the area page so their parse paths can't drift apart. */
export function parseRatingRange(value: string | string[] | undefined): [number, number] {
  const [min, max] = toArray(value).map(Number);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return DEFAULT_RATING_RANGE;
  const clamp = (bound: number) => Math.min(Math.max(Math.round(bound), 0), MAX_RATING);
  return [clamp(min), clamp(max)];
}
