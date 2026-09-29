"use server";

import { sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { journalVisibleSql } from "@/db/queries/content-access";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateTripSurfaces } from "./revalidation";

/** `removeMyJournalTag` for a trip: the friend leaves a tombstone, so the
 * owner's next save cannot tag them again. */
export async function removeMyTripTag(tripId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(tripId, "Trip not found");
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const db = await getDb();
    const [removed] = await db.all<{ ownerId: string }>(sql`
      UPDATE trip_companions
      SET suppressed = 1
      WHERE trip_id = ${id} AND user_id = ${user.id}
        AND EXISTS (
          SELECT 1 FROM trips t
          WHERE t.id = ${id} AND ${journalVisibleSql(user.id, sql`t.user_id`)}
        )
      RETURNING (SELECT t.user_id FROM trips t WHERE t.id = trip_id) AS ownerId
    `);
    if (!removed) throw new ActionError("This tag is no longer available");

    afterCommit(() => {
      revalidateTripSurfaces(removed.ownerId);
      refresh();
    });
  });
}
