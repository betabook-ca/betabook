/** The recap is promoted from Dec 1 to Jan 14, in the viewer's local time. */
const WINDOW_END_DAY = 14;
/** Before this month, the recap is still last year's. */
const RECAP_ROLLOVER_MONTH = 3;

/**
 * The one year the recap page shows on `today` (a civil `YYYY-MM-DD`): last
 * year until the end of February, this year from March 1.
 */
export function recapYear(today: string): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month < RECAP_ROLLOVER_MONTH ? year - 1 : year;
}

/**
 * The year whose recap the banner and journal card point to on `today`, or
 * null outside Dec 1 – Jan 14. December points to its own year and early
 * January to the year before, which is always `recapYear(today)`.
 *
 * `alwaysOpen` (the `YEAR_REVIEW_ALWAYS_OPEN` Worker variable, for local
 * testing) opens the window every day, pointing at the same year the page
 * shows.
 */
export function yearReviewWindow(today: string, alwaysOpen = false): number | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  if (!year || !month || !day) return null;
  if (alwaysOpen) return recapYear(today);
  if (month === 12) return year;
  if (month === 1 && day <= WINDOW_END_DAY) return year - 1;
  return null;
}

/** The years a recap URL may name: from the first plausible logged year to
 * the current one. */
export function parseRecapYear(value: string, currentYear: number): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1950 && year <= currentYear ? year : null;
}
