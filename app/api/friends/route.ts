import { getDb } from "@/db/client";
import { FRIENDS_PAGE_SIZE, getFriendsPage, getPendingFriendRequestCount } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseOffset, offsetReachesPaginationLimit } from "@/lib/url-params";

export const GET = withApiSession(async (session, request: Request) => {
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "count") {
    const count = await getPendingFriendRequestCount(await getDb(), session.user.id);
    return Response.json({ userId: session.user.id, count });
  }
  const offset = parseOffset(params);
  const page =
    offset === null
      ? { friends: [], hasMore: false }
      : await getFriendsPage(
          await getDb(),
          session.user.id,
          params.get("view") === "requests",
          offset,
        );
  return Response.json({
    ...page,
    hasMore: page.hasMore && !offsetReachesPaginationLimit(offset ?? 0, FRIENDS_PAGE_SIZE),
  });
});
