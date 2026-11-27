import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { AREA_SEARCH_PAGE_SIZE, getAreaBreadcrumbs, searchAreas } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { pageReachesPaginationLimit, parsePage } from "@/lib/url-params";

export const GET = withApiSession(async (_session, request: Request) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  const page = parsePage(url.searchParams, AREA_SEARCH_PAGE_SIZE);

  if (page === null) {
    return NextResponse.json({ areas: [], hasNextPage: false, areaBreadcrumbs: {} });
  }

  const db = await getDb();
  const results = await searchAreas(db, name, page, AREA_SEARCH_PAGE_SIZE);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    results.areas.map((a) => a.id),
  );

  return NextResponse.json({
    ...results,
    hasNextPage: results.hasNextPage && !pageReachesPaginationLimit(page, AREA_SEARCH_PAGE_SIZE),
    areaBreadcrumbs,
  });
});
