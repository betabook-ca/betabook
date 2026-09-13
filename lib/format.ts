/** "1 ascent" / "42 ascents" — a count with its noun, pluralized. The
 * locale is pinned so server and client render identically. */
export function formatCount(count: number, noun: string, plural = `${noun}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun : plural}`;
}

const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "$5.77"; raise `maximumFractionDigits` for per-unit rates like "$0.001". */
export function formatUsd(amount: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(amount);
}

/** "1.4M", "25B" */
export function formatCompact(value: number): string {
  return COMPACT.format(value);
}
