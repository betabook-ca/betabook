import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getJournalPage, type JournalCursor } from "@/db/queries";
import { canReadJournal } from "@/db/queries/content-access";
import { withApiSession } from "@/lib/api-session";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { parseId } from "@/lib/parse-id";
import { isRealIsoDate } from "@/lib/sends";
import { searchParamsToRecord } from "@/lib/url-params";

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id: userId } = await params;
  const url = new URL(request.url);
  const filter = parseJournalFilter(searchParamsToRecord(url.searchParams));

  const db = await getDb();
  const viewerId = session.user.id;

  if (!(await canReadJournal(db, userId, viewerId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cursorDate = url.searchParams.get("cursorDate");
  const rawCursorId = url.searchParams.get("cursorId");
  if ((cursorDate === null) !== (rawCursorId === null)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  let cursor: JournalCursor | null = null;
  if (cursorDate !== null && rawCursorId !== null) {
    const cursorId = parseId(rawCursorId);
    if (!isRealIsoDate(cursorDate) || cursorId === null) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    cursor = { entryDate: cursorDate, id: cursorId };
  }

  const page = await getJournalPage(db, userId, viewerId, filter, cursor);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    page.entries.flatMap((entry) => (entry.areaId == null ? [] : [entry.areaId])),
  );
  return NextResponse.json({
    entries: page.entries,
    hasMore: page.hasMore,
    areaBreadcrumbs,
  });
});
