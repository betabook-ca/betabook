import type { AnalyticsSendRow } from "@/db/queries";
import type { HighlightSession } from "@/lib/analytics-highlights";
import type { ClimbType } from "@/lib/grades";
import { inSelectedYears } from "@/lib/user-analytics";

/** Fields used by interactive charts; area names and ascent styles stay server-side. */
export type ChartSend = Pick<
  AnalyticsSendRow,
  "climbId" | "climbName" | "climbType" | "suggestedGrade" | "dateSent"
>;

export function selectChartSends(
  sends: readonly AnalyticsSendRow[],
  scope: ClimbType,
  selectedYears: readonly number[],
): ChartSend[] {
  return sends
    .filter((send) => send.climbType === scope && inSelectedYears(send.dateSent, selectedYears))
    .map(({ climbId, climbName, climbType, suggestedGrade, dateSent }) => ({
      climbId,
      climbName,
      climbType,
      suggestedGrade,
      dateSent,
    }));
}

export const CHART_PREVIEW_LIMIT = 3;

export type ChartClimbRow = {
  id: string;
  climbId: number;
  climbName: string;
  date: string | null;
  /** Original send date when the row represents a session or repeat. */
  sortDate?: string | null;
};

export type ChartDetailGroup = {
  title: string;
  summary: string;
  rows: ChartClimbRow[];
};

export type ChartSession = Pick<
  HighlightSession,
  "id" | "entryDate" | "climbId" | "climbName" | "climbType" | "sent" | "isAscent"
>;

export function sendChartRows(sends: readonly ChartSend[]): ChartClimbRow[] {
  return sends.map((send) => ({
    id: `send-${send.climbId}`,
    climbId: send.climbId,
    climbName: send.climbName,
    date: send.dateSent,
  }));
}

export function sessionChartRows(
  sessions: readonly ChartSession[],
  sends?: readonly AnalyticsSendRow[],
): ChartClimbRow[] {
  const sendDates = new Map(sends?.map((send) => [send.climbId, send.dateSent]));
  return sessions.map((session) => ({
    id: `session-${session.id}`,
    climbId: session.climbId,
    climbName: session.climbName,
    date: session.entryDate,
    sortDate: sendDates.get(session.climbId) ?? null,
  }));
}

/** List each climb once in send-date order, with undated climbs last. */
export function uniqueChartClimbs(rows: readonly ChartClimbRow[]): ChartClimbRow[] {
  const ordered = [...rows].sort((a, b) => {
    const first = a.sortDate === undefined ? a.date : a.sortDate;
    const second = b.sortDate === undefined ? b.date : b.sortDate;
    if (first == null) return second == null ? 0 : 1;
    if (second == null) return -1;
    return first.localeCompare(second);
  });
  const unique = new Map<number, ChartClimbRow>();
  for (const row of ordered) if (!unique.has(row.climbId)) unique.set(row.climbId, row);
  return [...unique.values()];
}
