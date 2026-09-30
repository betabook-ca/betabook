import type { AnalyticsSendRow } from "@/db/queries";
import type { ClimbType } from "@/lib/grades";
import type { AnalyticsJournalSession } from "@/lib/user-analytics";

/** The same day aggregation for a selected discipline set in Analytics and
 * the combined recap card. Journal sessions take precedence when available;
 * otherwise dated original sends supply the calendar. */
export function calendarCountsForDisciplines(
  sends: readonly Pick<AnalyticsSendRow, "climbType" | "dateSent">[],
  sessions: readonly AnalyticsJournalSession[] | undefined,
  types: readonly ClimbType[],
): Record<string, number> {
  const selected = new Set(types);
  const counts: Record<string, number> = {};
  if (sessions !== undefined) {
    for (const session of sessions) {
      if (session.climbType === null || !selected.has(session.climbType)) continue;
      counts[session.entryDate] = (counts[session.entryDate] ?? 0) + (session.count ?? 1);
    }
  } else {
    for (const send of sends) {
      if (!selected.has(send.climbType) || !send.dateSent) continue;
      counts[send.dateSent] = (counts[send.dateSent] ?? 0) + 1;
    }
  }
  return counts;
}
