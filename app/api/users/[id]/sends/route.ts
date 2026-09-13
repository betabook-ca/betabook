import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import {
  getAreaBreadcrumbs,
  getSendsForUserPage,
  getUser,
  USER_SENDS_PAGE_SIZE,
} from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { offsetReachesPaginationLimit, parseOffset, searchParamsToRecord } from "@/lib/url-params";
import { canViewUser } from "@/lib/user-visibility";

const headers = { "Cache-Control": "private, no-store" };

type RouteParams = { params: Promise<{ id: string }> };

/** Incremental "load more" for a user's send history — the initial page is
 * server-rendered; this backs subsequent pages so the client never has to
 * hold more than what's actually been scrolled to. */
export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id: userId } = await params;
  const url = new URL(request.url);
  const searchParams = searchParamsToRecord(url.searchParams);

  const filter = parseUserSendsFilter(searchParams);
  const safeOffset = parseOffset(url.searchParams);

  const db = await getDb();
  // A real 404 rather than a normal-looking empty page for any id — the
  // client checks res.ok, and an empty 200 would read as "end of list". A
  // private profile the viewer doesn't own gets the identical response, so
  // its existence isn't leaked either.
  const user = await getUser(db, userId);
  if (!user || !canViewUser(user, session?.user.id ?? null)) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers });
  }

  if (safeOffset === null) {
    return NextResponse.json({ sends: [], hasMore: false, areaBreadcrumbs: {} }, { headers });
  }

  const page = await getSendsForUserPage(
    db,
    userId,
    filter,
    safeOffset,
    undefined,
    session?.user.id ?? null,
  );
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    page.sends.map((send) => send.areaId),
  );

  return NextResponse.json(
    {
      ...page,
      hasMore: page.hasMore && !offsetReachesPaginationLimit(safeOffset, USER_SENDS_PAGE_SIZE),
      areaBreadcrumbs,
    },
    { headers },
  );
});
