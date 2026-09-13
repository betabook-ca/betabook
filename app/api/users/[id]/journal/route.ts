import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getJournalPage, getUser, type JournalCursor } from "@/db/queries";
import { canReadJournal } from "@/db/queries/content-access";
import { withApiSession } from "@/lib/api-session";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { isRealIsoDate } from "@/lib/sends";
import { searchParamsToRecord } from "@/lib/url-params";

const headers = { "Cache-Control": "private, no-store" };

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id: userId } = await params;
  const url = new URL(request.url);
  const filter = parseJournalFilter(searchParamsToRecord(url.searchParams));

  const db = await getDb();
  const viewerId = session?.user.id ?? null;

  const user = await getUser(db, userId);
  if (!user || !(await canReadJournal(db, user.id, viewerId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers });
  }

  const cursorDate = url.searchParams.get("cursorDate");
  const rawCursorId = url.searchParams.get("cursorId");
  if ((cursorDate === null) !== (rawCursorId === null)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400, headers });
  }

  let cursor: JournalCursor | null = null;
  if (cursorDate !== null && rawCursorId !== null) {
    const cursorId = Number(rawCursorId);
    if (!isRealIsoDate(cursorDate) || !Number.isInteger(cursorId) || cursorId < 1) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400, headers });
    }
    cursor = { entryDate: cursorDate, id: cursorId };
  }

  const page = await getJournalPage(db, user.id, viewerId, filter, cursor);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    page.entries.flatMap((entry) => (entry.areaId == null ? [] : [entry.areaId])),
  );
  return NextResponse.json(
    {
      entries: page.entries,
      hasMore: page.hasMore,
      areaBreadcrumbs,
    },
    { headers },
  );
});
