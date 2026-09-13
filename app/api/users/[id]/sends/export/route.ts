import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getSendsForUserExportPage, type UserSendsExportCursor } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseId } from "@/lib/parse-id";

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
  const afterId = rawAfterId === null ? null : parseId(rawAfterId);
  const rawAfterDate = searchParams.get("afterDate");
  const validAfterDate =
    rawAfterDate === "null" || (rawAfterDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(rawAfterDate));
  const cursor: UserSendsExportCursor | null =
    afterId === null
      ? null
      : { id: afterId, dateSent: rawAfterDate === "null" ? null : rawAfterDate };

  if (rawAfterId !== null && (afterId === null || !validAfterDate)) {
    return NextResponse.json({ error: "Invalid export cursor" }, { status: 400 });
  }

  const db = await getDb();
  return NextResponse.json(await getSendsForUserExportPage(db, userId, cursor));
});
