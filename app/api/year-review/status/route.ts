import { getDb } from "@/db/client";
import { getYearReviewStatus } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseRecapYear } from "@/lib/year-in-review";

/** Whether the signed-in climber's year has anything to recap, for the
 * banner and the journal card. A count, not the full recap. */
export const GET = withApiSession(async (session, request: Request) => {
  const value = new URL(request.url).searchParams.get("year") ?? "";
  const year = parseRecapYear(value, new Date().getUTCFullYear() + 1);
  if (year === null) return Response.json({ error: "Invalid year" }, { status: 400 });
  const status = await getYearReviewStatus(await getDb(), session.user.id, year);
  return Response.json({ userId: session.user.id, year, ...status });
});
