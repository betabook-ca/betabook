import { NextResponse } from "next/server";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb, type Database } from "@/db/client";
import { canReadJournal } from "@/db/queries/content-access";
import { getGoalPage, getGoalContributions, getRecurringGoalHistory } from "@/db/queries/goals";
import { withApiSession } from "@/lib/api-session";
import { GOAL_PAGE_SIZE } from "@/lib/goal-history";
import { parseGoalView } from "@/lib/goals";
import { parseId } from "@/lib/parse-id";
import { isRealIsoDate } from "@/lib/sends";
import { MAX_PAGINATION_OFFSET, offsetReachesPaginationLimit, parseOffset } from "@/lib/url-params";

function validYear(year: number | undefined) {
  return year === undefined || (Number.isInteger(year) && year >= 1 && year <= 9999);
}
function validGoalPeriod(start: string, end?: string) {
  return isRealIsoDate(start) && (end === undefined || (isRealIsoDate(end) && end >= start));
}
async function historyPage(
  db: Database,
  ownerId: string,
  viewerId: string,
  goalId: number,
  offset: number | null,
  anchor: string | undefined,
) {
  if (offset === null) return { periods: [], hasMore: false };
  const history = await getRecurringGoalHistory(
    db,
    ownerId,
    viewerId,
    goalId,
    offset,
    new Date(),
    anchor,
  );
  // History pages by months, so the next request's offset is what must fit the budget.
  return {
    ...history,
    hasMore: history.hasMore && history.nextOffset <= MAX_PAGINATION_OFFSET,
  };
}
export const GET = withApiSession(
  async (session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const db = await getDb();
    if (!(await canReadJournal(db, id, session.user.id)))
      return NextResponse.json({ error: "Journal not found" }, { status: 404 });
    const query = new URL(request.url).searchParams;
    const offset = parseOffset(query);
    const year = query.has("year") ? Number(query.get("year")) : undefined;
    if (!validYear(year)) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const rawHistoryId = query.get("historyId");
    const anchor = query.get("anchor") ?? undefined;
    if (anchor !== undefined && !isRealIsoDate(`${anchor}-01`))
      return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
    if (rawHistoryId !== null) {
      const historyId = parseId(rawHistoryId);
      if (historyId === null) return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
      return NextResponse.json(
        await historyPage(db, id, session.user.id, historyId, offset, anchor),
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
    if (offset === null) return NextResponse.json({ goals: [], hasMore: false });
    const page = await getGoalPage(db, id, session.user.id, view, offset, new Date(), year);
    if (id === session.user.id) await scheduleGoalRefresh(db, id);
    return NextResponse.json({
      ...page,
      hasMore: page.hasMore && !offsetReachesPaginationLimit(offset, GOAL_PAGE_SIZE),
    });
  },
);
