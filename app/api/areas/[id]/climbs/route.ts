import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getAreaWithSubtreeSize,
  getClimbSendStats,
  getSubtreeClimbs,
  getUserSentClimbIds,
  PAGE_SIZE,
  resolveSubareaScope,
} from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import {
  parseAreaClimbsFilter,
  parseAreaClimbsSort,
  toSubtreeQueryFilter,
} from "@/lib/filters/area-climbs-filter";
import { parseId } from "@/lib/parse-id";
import { offsetReachesPaginationLimit, parseOffset, searchParamsToRecord } from "@/lib/url-params";

type RouteParams = { params: Promise<{ id: string }> };

/** "Load more" for an area's climb list. */
export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id } = await params;
  const areaId = parseId(id);
  const url = new URL(request.url);
  const searchParams = searchParamsToRecord(url.searchParams);

  const sort = parseAreaClimbsSort(searchParams);
  const filter = parseAreaClimbsFilter(searchParams);
  const offset = parseOffset(url.searchParams);

  const db = await getDb();
  const area = areaId === null ? undefined : await getAreaWithSubtreeSize(db, areaId);
  if (!area) {
    // A real error shape, not a valid-looking empty page — the client checks
    // res.ok, and an empty page body would read as "end of list".
    return NextResponse.json({ error: "Area not found" }, { status: 404 });
  }

  if (offset === null) {
    return NextResponse.json({
      climbs: [],
      hasNextPage: false,
      sendStats: {},
      areaBreadcrumbs: {},
      sentClimbIds: [],
    });
  }

  const listScope = await resolveSubareaScope(db, area, filter.subareaId);
  const subtreeClimbs = await getSubtreeClimbs(
    db,
    listScope,
    1,
    sort,
    toSubtreeQueryFilter(filter),
    PAGE_SIZE,
    offset,
  );

  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(
      db,
      subtreeClimbs.climbs.map((c) => c.id),
    ),
    getAreaBreadcrumbs(
      db,
      subtreeClimbs.climbs.map((c) => c.areaId),
    ),
    getUserSentClimbIds(
      db,
      session.user.id,
      subtreeClimbs.climbs.map((climb) => climb.id),
    ),
  ]);

  return NextResponse.json({
    ...subtreeClimbs,
    hasNextPage: subtreeClimbs.hasNextPage && !offsetReachesPaginationLimit(offset, PAGE_SIZE),
    sendStats,
    areaBreadcrumbs,
    sentClimbIds: [...sentClimbIds],
  });
});
