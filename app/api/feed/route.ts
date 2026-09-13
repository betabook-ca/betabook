import { getDb } from "@/db/client";
import { getFeedPage } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseFeedCursor, parseFeedView } from "@/lib/feed";

const headers = { "Cache-Control": "private, no-store" };

export const GET = withApiSession(async (session, request: Request) => {
  const params = new URL(request.url).searchParams;
  const view = parseFeedView(params.get("view"));
  let cursor;
  try {
    cursor = parseFeedCursor(params.get("cursor"), view);
  } catch {
    return Response.json({ error: "Invalid feed cursor" }, { status: 400, headers });
  }
  return Response.json(await getFeedPage(await getDb(), session.user.id, view, cursor), {
    headers,
  });
});
