import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getSendsForUserExportPage, type UserSendsExportCursor } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseId } from "@/lib/parse-id";
import { isRealIsoDate } from "@/lib/sends";

type RouteParams = { params: Promise<{ id: string }> };

/** Owner-only, keyset-paginated source for the full CSV export. Keeping this
 * separate from the member-visible profile list lets normal UI requests retain their
 * defensive OFFSET cap without truncating or replaying a large export. */
export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id: userId } = await params;
  if (session.user.id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const rawAfterId = searchParams.get("afterId");
  const rawAfterDate = searchParams.get("afterDate");
  let cursor: UserSendsExportCursor | null = null;
  if (rawAfterId !== null || rawAfterDate !== null) {
    const afterId = rawAfterId === null ? null : parseId(rawAfterId);
    // "null" is the cursor for an undated send.
    const dateSent = rawAfterDate === "null" ? null : rawAfterDate;
    if (
      afterId === null ||
      rawAfterDate === null ||
      (dateSent !== null && !isRealIsoDate(dateSent))
    )
      return NextResponse.json({ error: "Invalid export cursor" }, { status: 400 });
    cursor = { id: afterId, dateSent };
  }

  const db = await getDb();
  return NextResponse.json(await getSendsForUserExportPage(db, userId, cursor));
});
