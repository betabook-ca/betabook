import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getClimbListChoices } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { parseId } from "@/lib/parse-id";

type RouteParams = { params: Promise<{ id: string }> };

/** The signed-in climber's own lists, each saying whether it holds this
 * climb, for the Add to list drawer on a climb page. Loaded when the drawer
 * opens, so the climb page doesn't read every list on every visit. */
export const GET = withApiSession(async (session, _request: Request, { params }: RouteParams) => {
  const { id } = await params;
  const climbId = parseId(id);
  if (climbId === null) return NextResponse.json({ error: "Climb not found" }, { status: 404 });
  const lists = await getClimbListChoices(await getDb(), session.user.id, climbId);
  return NextResponse.json({ lists });
});
