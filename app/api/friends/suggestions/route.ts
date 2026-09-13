import { getDb } from "@/db/client";
import { getClimberSuggestions } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";

export const GET = withApiSession(async (session) =>
  Response.json({ climbers: await getClimberSuggestions(await getDb(), session.user.id) }),
);
