import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { AREA_SEARCH_PAGE_SIZE, getAreaBreadcrumbs, searchAreas } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { pageReachesPaginationLimit, parsePage, parseSuggestionLimit } from "@/lib/url-params";

/** Backs two callers with the same query.
 *
 * Without `limit`: incremental "load more" for home-page area search — the
 * initial page is server-rendered (app/page.tsx); this backs subsequent
 * pages.
 *
 * With `limit`: suggestion mode for the area typeaheads. `searchAreas`
 * already returns each row's `ancestorPath`, which is the only context a
 * popover row shows, so the breadcrumb pass is skipped. */
export const GET = withApiSession(async (_session, request: Request) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  const limit = parseSuggestionLimit(url.searchParams);
  const pageSize = limit ?? AREA_SEARCH_PAGE_SIZE;
  const page = parsePage(url.searchParams, pageSize);

  if (page === null) {
    return NextResponse.json(
      limit === null ? { areas: [], hasNextPage: false, areaBreadcrumbs: {} } : { areas: [] },
    );
  }

  const db = await getDb();
  const results = await searchAreas(db, name, page, pageSize);

  if (limit !== null) {
    return NextResponse.json({ areas: results.areas.slice(0, limit) });
  }

  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    results.areas.map((a) => a.id),
  );

  return NextResponse.json({
    ...results,
    hasNextPage: results.hasNextPage && !pageReachesPaginationLimit(page, pageSize),
    areaBreadcrumbs,
  });
});
