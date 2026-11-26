"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { MAX_TRIPS, tripInputSchema, tripNotesSchema } from "@/lib/trips";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateTripSurfaces } from "./revalidation";
import {
  NEW_TRIP,
  buildTripCompanionInsert,
  buildTripCompanionReplacement,
  saveTripBatch,
} from "./trip-companion-statements";

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
    const { name, description, albumUrl, startDate, endDate, companions } = parsed.data;

    const db = await getDb();

    if (tripId != null) {
      const id = requirePositiveId(tripId, TRIP_NOT_FOUND);
      // Uses the query builder because D1 batch can't bind raw statements.
      // `$onUpdate` in the schema sets updated_at.
      const [[updated]] = await saveTripBatch(db, [
        db
          .update(trips)
          .set({
            name,
            description: description ?? null,
            albumUrl: albumUrl ?? null,
            startDate,
            endDate,
          })
          .where(and(eq(trips.id, id), eq(trips.userId, user.id)))
          .returning({ id: trips.id }),
        ...(companions ? buildTripCompanionReplacement(db, user.id, id, companions) : []),
      ]);
      if (!updated) throw new ActionError(TRIP_NOT_FOUND);

      afterCommit(() => {
        revalidateTripSurfaces(user.id);
        refresh();
      });
      return updated.id;
    }

    // The cap is a condition on the INSERT, not a prior COUNT, so two
    // concurrent creates cannot both observe room and both take it.
    const now = sql`cast(unixepoch('subsecond') * 1000 as integer)`;
    const [[created]] = await saveTripBatch(db, [
      db
        .insert(trips)
        .select(
          db
            .select({
              id: sql`NULL`.as("id"),
              userId: sql`${user.id}`.as("user_id"),
              name: sql`${name}`.as("name"),
              description: sql`${description ?? null}`.as("description"),
              notes: sql`NULL`.as("notes"),
              albumUrl: sql`${albumUrl ?? null}`.as("album_url"),
              startDate: sql`${startDate}`.as("start_date"),
              endDate: sql`${endDate}`.as("end_date"),
              createdAt: sql`${now}`.as("created_at"),
              updatedAt: sql`${now}`.as("updated_at"),
            })
            .from(sql`(SELECT 1)`)
            .where(sql`(SELECT COUNT(*) FROM trips WHERE user_id = ${user.id}) < ${MAX_TRIPS}`),
        )
        .returning({ id: trips.id }),
      ...(companions?.length ? [buildTripCompanionInsert(db, user.id, companions, NEW_TRIP)] : []),
    ]);
    if (!created) throw new ActionError(TRIP_LIMIT_MESSAGE);

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
    return created.id;
  });
}

/** Separate from `saveTrip` so the trip dialog, which never loads notes, can't
 * overwrite them with a stale value. */
export async function saveTripNotes(tripId: number, raw: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(tripId, TRIP_NOT_FOUND);
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const parsed = tripNotesSchema.safeParse(raw);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Check the form");

    const db = await getDb();
    const [updated] = await db.all<{ id: number }>(sql`
      UPDATE trips
      SET notes = ${parsed.data},
          updated_at = cast(unixepoch('subsecond') * 1000 as integer)
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING id
    `);
    if (!updated) throw new ActionError(TRIP_NOT_FOUND);

    afterCommit(() => refresh());
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
