import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import {
  SEARCH_PAGE_SIZE,
  getAreaBreadcrumbs,
  getClimbSendStats,
  getUserSentClimbIds,
  searchClimbs,
} from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseClimbListSort } from "@/lib/climb-list-sort";
import { parseClimbFilter, toClimbQueryParams } from "@/lib/filters/climb-filter";
import { pageReachesPaginationLimit, parsePage, searchParamsToRecord } from "@/lib/url-params";

export const GET = withApiSession(async (session, request: Request) => {
  const url = new URL(request.url);
  const searchParams = searchParamsToRecord(url.searchParams);
  const sort = parseClimbListSort(searchParams);
  const filter = parseClimbFilter(searchParams);
  const page = parsePage(url.searchParams, SEARCH_PAGE_SIZE);

  if (page === null) {
    return NextResponse.json({
      climbs: [],
      hasNextPage: false,
      sendStats: {},
      areaBreadcrumbs: {},
      sentClimbIds: [],
    });
  }

  const db = await getDb();
  const results = await searchClimbs(db, toClimbQueryParams(filter, sort), page, SEARCH_PAGE_SIZE);
  const climbIds = results.climbs.map((c) => c.id);
  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(db, climbIds),
    getAreaBreadcrumbs(
      db,
      results.climbs.map((c) => c.areaId),
    ),
    getUserSentClimbIds(db, session.user.id, climbIds),
  ]);

  return NextResponse.json({
    ...results,
    hasNextPage: results.hasNextPage && !pageReachesPaginationLimit(page, SEARCH_PAGE_SIZE),
    sendStats,
    areaBreadcrumbs,
    sentClimbIds: [...sentClimbIds],
  });
});
