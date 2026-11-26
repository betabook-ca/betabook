import { toArray } from "@/lib/url-params";

/** Highest possible rating — sends.rating is validated to 1..MAX_RATING
 * (see lib/sends.ts), so no climb's avg_rating can exceed it. */
export const MAX_RATING = 5;

/** [min, max] avg-rating bounds. 0 on either side is the "Any" sentinel
 * (that side is unbounded); a max of MAX_RATING is also unbounded, since no
 * average rating can exceed it. The default, [0, 0], is unbounded on both
 * sides, and the shared rating control shows it as the full 1–5 range. */
export const DEFAULT_RATING_RANGE: [number, number] = [0, 0];

/** A picked [min, max] as a filter value: the full 1–MAX_RATING range is no
 * filter, so it is written as DEFAULT_RATING_RANGE and leaves the URL as it
 * would be unfiltered. */
export function ratingRangeValue([min, max]: [number, number]): [number, number] {
  return (min || 1) === 1 && (max || MAX_RATING) === MAX_RATING
    ? [...DEFAULT_RATING_RANGE]
    : [min, max];
}

export const DEFAULT_MIN_ASCENTS = 0;

/** `?excludeSent=1` hides the reader's sent climbs. Anything else is off. The
 * parameter only says "my sends"; whose sends is always the session's. */
export function parseExcludeSent(value: string | string[] | undefined): boolean {
  return toArray(value)[0] === "1";
}

/** The query field for `excludeSent`: the viewer's id, or nothing when the
 * filter is off or no one is signed in. */
export function excludeSentBy(
  excludeSent: boolean | undefined,
  viewerId: string | null | undefined,
): string | undefined {
  return excludeSent && viewerId ? viewerId : undefined;
}

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
