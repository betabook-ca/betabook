import { NextResponse } from "next/server";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb } from "@/db/client";
import { canReadJournal } from "@/db/queries/content-access";
import { getGoalPage, getGoalContributions, getRecurringGoalHistory } from "@/db/queries/goals";
import { withApiSession } from "@/lib/api-session";
import { parseGoalView } from "@/lib/goals";
import { parseId } from "@/lib/parse-id";
import { isRealIsoDate } from "@/lib/sends";

function validPage(offset: number, year: number | undefined) {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= 100000 &&
    (year === undefined || (Number.isInteger(year) && year >= 1 && year <= 9999))
  );
}
function validGoalPeriod(start: string, end?: string) {
  return isRealIsoDate(start) && (end === undefined || (isRealIsoDate(end) && end >= start));
}
export const GET = withApiSession(
  async (session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const db = await getDb();
    if (!(await canReadJournal(db, id, session.user.id)))
      return NextResponse.json({ error: "Journal not found" }, { status: 404 });
    const query = new URL(request.url).searchParams;
    const offset = Number(query.get("offset") ?? 0);
    const year = query.has("year") ? Number(query.get("year")) : undefined;
    if (!validPage(offset, year))
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const rawHistoryId = query.get("historyId");
    const anchor = query.get("anchor") ?? undefined;
    if (anchor !== undefined && !isRealIsoDate(`${anchor}-01`))
      return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
    if (rawHistoryId !== null) {
      const historyId = parseId(rawHistoryId);
      if (historyId === null) return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
      return NextResponse.json(
        await getRecurringGoalHistory(
          db,
          id,
          session.user.id,
          historyId,
          offset,
          new Date(),
          anchor,
        ),
      );
    }
    const rawGoalId = query.get("goalId");
    if (rawGoalId !== null) {
      const goalId = parseId(rawGoalId);
      const start = query.get("periodStart") ?? "";
      const end = query.get("periodEnd") ?? undefined;
      if (goalId === null || !validGoalPeriod(start, end))
        return NextResponse.json({ error: "Invalid goal period" }, { status: 400 });
      return NextResponse.json({
        items: await getGoalContributions(db, id, session.user.id, goalId, start, new Date(), end),
      });
    }
    const view = parseGoalView(query.get("view") ?? "active");
    if (view === null) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const page = await getGoalPage(db, id, session.user.id, view, offset, new Date(), year);
    if (id === session.user.id) await scheduleGoalRefresh(db, id);
    return NextResponse.json(page);
  },
);
