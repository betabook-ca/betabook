import { getDb } from "@/db/client";
import { getClimbersPage } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseOffset, offsetReachesPaginationLimit } from "@/lib/url-params";

export const GET = withApiSession(async (session, request: Request) => {
  const params = new URL(request.url).searchParams;
  const offset = parseOffset(params);
  const page =
    offset === null
      ? { climbers: [], hasMore: false }
      : await getClimbersPage(await getDb(), session?.user.id ?? null, {
          name: params.get("name") ?? "",
          offset,
        });
  return Response.json(
    { ...page, hasMore: page.hasMore && !offsetReachesPaginationLimit(offset ?? 0, 20) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
