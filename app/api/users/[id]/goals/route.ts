import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { canReadJournal } from "@/db/queries/content-access";
import { getGoalPage, getGoalContributions, getRecurringGoalHistory } from "@/db/queries/goals";
import { withApiSession } from "@/lib/api-session";
import { isRealIsoDate } from "@/lib/sends";

function validPage(offset: number, year: number | undefined) {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= 100000 &&
    (year === undefined || (Number.isInteger(year) && year >= 1 && year <= 9999))
  );
}
function validGoalPeriod(id: string, start: string, end?: string) {
  return (
    Number.isSafeInteger(Number(id)) &&
    Number(id) > 0 &&
    isRealIsoDate(start) &&
    (end === undefined || (isRealIsoDate(end) && end >= start))
  );
}
const headers = { "Cache-Control": "private, no-store" };
export const GET = withApiSession(
  async (session, request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const db = await getDb();
    if (!(await canReadJournal(db, id, session.user.id)))
      return NextResponse.json({ error: "Journal not found" }, { status: 404, headers });
    const query = new URL(request.url).searchParams;
    const offset = Number(query.get("offset") ?? 0);
    const year = query.has("year") ? Number(query.get("year")) : undefined;
    if (!validPage(offset, year))
      return NextResponse.json({ error: "Invalid page" }, { status: 400, headers });
    const historyId = query.get("historyId");
    const anchor = query.get("anchor") ?? undefined;
    if (anchor !== undefined && !isRealIsoDate(`${anchor}-01`))
      return NextResponse.json({ error: "Invalid history cursor" }, { status: 400, headers });
    if (historyId !== null) {
      if (!Number.isSafeInteger(Number(historyId)) || Number(historyId) < 1)
        return NextResponse.json({ error: "Invalid goal" }, { status: 400, headers });
      return NextResponse.json(
        await getRecurringGoalHistory(
          db,
          id,
          session.user.id,
          Number(historyId),
          offset,
          new Date(),
          anchor,
        ),
        { headers },
      );
    }
    const goalId = query.get("goalId");
    if (goalId !== null) {
      const start = query.get("periodStart") ?? "";
      const end = query.get("periodEnd") ?? undefined;
      if (!validGoalPeriod(goalId, start, end))
        return NextResponse.json({ error: "Invalid goal period" }, { status: 400, headers });
      return NextResponse.json(
        {
          items: await getGoalContributions(
            db,
            id,
            session.user.id,
            Number(goalId),
            start,
            new Date(),
            end,
          ),
        },
        { headers },
      );
    }
    const view = query.get("view") ?? "active";
    if (!["active", "completed"].includes(view))
      return NextResponse.json({ error: "Invalid page" }, { status: 400, headers });
    return NextResponse.json(
      await getGoalPage(
        db,
        id,
        session.user.id,
        view as "active" | "completed",
        offset,
        new Date(),
        year,
      ),
      { headers },
    );
  },
);
