export type ImportDateCluster = { date: string; count: number; datedCount: number };

/** Review unusual concentrations without deciding whether a date is incorrect.
 * Small sessions are common: require 20 sends and at least 25% of dated rows. */
export function findImportDateClusters(
  rows: readonly { dateSent: string | null }[],
): ImportDateCluster[] {
  const counts = new Map<string, number>();
  let datedCount = 0;
  for (const row of rows) {
    if (!row.dateSent) continue;
    datedCount += 1;
    counts.set(row.dateSent, (counts.get(row.dateSent) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= 20 && count * 4 >= datedCount)
    .map(([date, count]) => ({ date, count, datedCount }))
    .sort((a, b) => b.count - a.count || a.date.localeCompare(b.date));
}
