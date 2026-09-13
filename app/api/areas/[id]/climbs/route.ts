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
import {
  offsetReachesPaginationLimit,
  pageReachesPaginationLimit,
  parseOffset,
  parsePage,
  parseSuggestionLimit,
  searchParamsToRecord,
} from "@/lib/url-params";

type RouteParams = { params: Promise<{ id: string }> };

/** Backs two callers with the same query.
 *
 * With `offset`: incremental loading for an area's climb list.
 *
 * With `limit`: suggestion mode for the area page's route typeahead, which
 * searches names within this area's subtree. Same skip-the-join-passes
 * reasoning as /api/search/climbs. */
export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id } = await params;
  const areaId = parseId(id);
  const url = new URL(request.url);
  const searchParams = searchParamsToRecord(url.searchParams);

  const sort = parseAreaClimbsSort(searchParams);
  const filter = parseAreaClimbsFilter(searchParams);
  const offsetMode = url.searchParams.has("offset");
  const suggestionLimit = offsetMode ? null : parseSuggestionLimit(url.searchParams);
  const pageSize = suggestionLimit ?? PAGE_SIZE;
  const page = offsetMode ? 1 : parsePage(url.searchParams, pageSize);
  const offset = offsetMode ? parseOffset(url.searchParams) : undefined;

  const db = await getDb();
  const area = areaId === null ? undefined : await getAreaWithSubtreeSize(db, areaId);
  if (!area) {
    // A real error shape, not a valid-looking empty page — the client checks
    // res.ok, and an empty page body would read as "end of list".
    return NextResponse.json({ error: "Area not found" }, { status: 404 });
  }

  if (page === null || offset === null) {
    return NextResponse.json(
      suggestionLimit === null
        ? {
            climbs: [],
            hasNextPage: false,
            sendStats: {},
            areaBreadcrumbs: {},
            sentClimbIds: [],
          }
        : { climbs: [] },
    );
  }

  const listScope = await resolveSubareaScope(db, area, filter.subareaId);
  const subtreeClimbs = await getSubtreeClimbs(
    db,
    listScope,
    page,
    sort,
    toSubtreeQueryFilter(filter),
    pageSize,
    offset,
  );

  if (suggestionLimit !== null) {
    return NextResponse.json({ climbs: subtreeClimbs.climbs.slice(0, suggestionLimit) });
  }

  const [sendStats, areaBreadcrumbs, sentClimbIds] = await Promise.all([
    getClimbSendStats(
      db,
      subtreeClimbs.climbs.map((c) => c.id),
    ),
    getAreaBreadcrumbs(
      db,
      subtreeClimbs.climbs.map((c) => c.areaId),
    ),
    session
      ? getUserSentClimbIds(
          db,
          session.user.id,
          subtreeClimbs.climbs.map((climb) => climb.id),
        )
      : Promise.resolve(undefined),
  ]);

  return NextResponse.json({
    ...subtreeClimbs,
    hasNextPage:
      subtreeClimbs.hasNextPage &&
      !(offsetMode
        ? offsetReachesPaginationLimit(offset ?? 0, pageSize)
        : pageReachesPaginationLimit(page, pageSize)),
    sendStats,
    areaBreadcrumbs,
    sentClimbIds: sentClimbIds ? [...sentClimbIds] : undefined,
  });
});
