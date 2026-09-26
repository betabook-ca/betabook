"use server";

import { sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { MAX_TRIPS, tripInputSchema } from "@/lib/trips";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateTripSurfaces } from "./revalidation";

const TRIP_NOT_FOUND = "Trip not found";
const TRIP_LIMIT_MESSAGE = `You can keep ${MAX_TRIPS} trips. Delete one to add another.`;

/** Creates a trip, or edits one the climber already owns.
 *
 * A trip owns no entries, so editing its dates moves the window rather than
 * reassigning anything: the sessions and sends it covers are recomputed by
 * every read from the two dates, and nothing is written to them here. Widening
 * a trip to include a week already logged is therefore a supported edit, not a
 * migration, and narrowing one loses no history.
 *
 * Ownership is a condition on the UPDATE rather than a read before it, so a
 * guessed id cannot be used to probe for another climber's trips: both a
 * missing trip and someone else's produce the same "Trip not found".
 */
export async function saveTrip(tripId: number | null, raw: unknown): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const parsed = tripInputSchema.safeParse(raw);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the form");
    const { name, description, startDate, endDate } = parsed.data;

    const db = await getDb();

    if (tripId != null) {
      const id = requirePositiveId(tripId, TRIP_NOT_FOUND);
      const [updated] = await db.all<{ id: number }>(sql`
        UPDATE trips
        SET name = ${name}, description = ${description ?? null},
            start_date = ${startDate}, end_date = ${endDate},
            -- Set here, not by the schema's \$onUpdate: that hook belongs to
            -- the query builder, and this statement is raw SQL, so without
            -- this line every edit would leave updated_at at creation time.
            updated_at = cast(unixepoch('subsecond') * 1000 as integer)
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING id
      `);
      if (!updated) throw new ActionError(TRIP_NOT_FOUND);

      afterCommit(() => {
        revalidateTripSurfaces(user.id);
        refresh();
      });
      return updated.id;
    }

    // The cap is a condition on the INSERT, not a prior COUNT, so two
    // concurrent creates cannot both observe room and both take it.
    const [created] = await db.all<{ id: number }>(sql`
      INSERT INTO trips (user_id, name, description, start_date, end_date)
      SELECT ${user.id}, ${name}, ${description ?? null}, ${startDate}, ${endDate}
      WHERE (SELECT COUNT(*) FROM trips WHERE user_id = ${user.id}) < ${MAX_TRIPS}
      RETURNING id
    `);
    if (!created) throw new ActionError(TRIP_LIMIT_MESSAGE);

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
    return created.id;
  });
}

/** Deletes the trip and nothing else. The sessions and sends it covered are
 * untouched — they were never the trip's to begin with, only dated inside it —
 * so this removes a saved view, not a record of climbing. */
export async function deleteTrip(tripId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(tripId, TRIP_NOT_FOUND);
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const db = await getDb();
    await db.run(sql`DELETE FROM trips WHERE id = ${id} AND user_id = ${user.id}`);

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
  });
}
