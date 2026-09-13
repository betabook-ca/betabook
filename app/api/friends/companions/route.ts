import { getDb } from "@/db/client";
import { searchCompanionFriends } from "@/db/queries/journal-companions";
import { withApiSession } from "@/lib/api-session";

const headers = { "Cache-Control": "private, no-store" };
export const GET = withApiSession(async (session, request: Request) => {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const friends = query.trim()
    ? await searchCompanionFriends(await getDb(), session.user.id, query)
    : [];
  return Response.json({ friends }, { headers });
});
