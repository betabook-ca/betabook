import { getDb } from "@/db/client";
import { getFeedPage } from "@/db/queries";
import { FEED_PAGE_SIZE } from "@/db/queries/feed";
import { withApiSession } from "@/lib/api-session";
import { parseFeedCursor, parseFeedView } from "@/lib/feed";
import { gradePreferencesFor } from "@/lib/grade-preferences";

export const GET = withApiSession(async (session, request: Request) => {
  const params = new URL(request.url).searchParams;
  const view = parseFeedView(params.get("view"));
  let cursor;
  try {
    cursor = parseFeedCursor(params.get("cursor"), view);
  } catch {
    return Response.json({ error: "Invalid feed cursor" }, { status: 400 });
  }
  return Response.json(
    await getFeedPage(
      await getDb(),
      session.user.id,
      view,
      cursor,
      FEED_PAGE_SIZE,
      gradePreferencesFor(session.user),
    ),
  );
});
