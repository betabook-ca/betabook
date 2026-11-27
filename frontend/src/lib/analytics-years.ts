/** Empty selection means All, including undated sends. */
export function parseAnalyticsYears(
  value: string | string[] | undefined,
  available: readonly number[],
): number[] {
  const values = (Array.isArray(value) ? value : [value ?? ""]).flatMap((part) => part.split(","));
  return [
    ...new Set(
      values
        .filter((part) => /^\d{4}$/.test(part))
        .map(Number)
        .filter((year) => available.includes(year)),
    ),
  ].sort((a, b) => a - b);
}

/** Collapse only consecutive years; never imply that unselected years are included. */
export function formatAnalyticsYears(years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (!sorted.length) return "All time";
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i += 1;
    ranges.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`);
  }
  return ranges.join(", ");
}
