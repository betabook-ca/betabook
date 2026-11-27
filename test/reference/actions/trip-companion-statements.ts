import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db/client";
import { tripCompanions } from "@/db/schema";
import { ActionError, errorChainIncludes } from "@/lib/action-result";

/** Selects the trip inserted by the previous statement in the batch. If that
 * insert was skipped because the user is at their trip limit,
 * `last_insert_rowid()` still holds an older id, so `changes() > 0` is required
 * as well. */
export const NEW_TRIP = sql`t.id = last_insert_rowid() AND changes() > 0`;

/** Tags `ids` on the trips matched by `trip`, limited to trips owned by
 * `ownerId`. MATERIALIZED reads the id once, before the inserts below change
 * `last_insert_rowid()`. */
export function buildTripCompanionInsert(db: Database, ownerId: string, ids: string[], trip: SQL) {
  return db
    .insert(tripCompanions)
    .select(sql`
      WITH tagged AS MATERIALIZED (
        SELECT t.id FROM trips t WHERE t.user_id = ${ownerId} AND ${trip}
      )
      SELECT tagged.id, selection.value,
        min(${ownerId}, selection.value), max(${ownerId}, selection.value), 0
      FROM tagged CROSS JOIN json_each(${JSON.stringify(ids)}) selection WHERE true
    `)
    .onConflictDoNothing();
}

/** Keep tombstone rows (friends who removed themselves) so the insert guard
 * keeps blocking re-tagging. */
export function buildTripCompanionReplacement(
  db: Database,
  ownerId: string,
  tripId: number,
  ids: string[],
) {
  return [
    db
      .delete(tripCompanions)
      .where(
        and(
          eq(tripCompanions.tripId, tripId),
          eq(tripCompanions.suppressed, false),
          ids.length ? notInArray(tripCompanions.userId, ids) : undefined,
          sql`EXISTS (SELECT 1 FROM trips WHERE id = ${tripId} AND user_id = ${ownerId})`,
        ),
      ),
    buildTripCompanionInsert(db, ownerId, ids, sql`t.id = ${tripId}`),
  ];
}

export async function saveTripBatch<
  Statements extends [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
>(db: Database, statements: Statements) {
  try {
    return await db.batch(statements);
  } catch (error) {
    if (errorChainIncludes(error, "trip companion:"))
      throw new ActionError(
        "A selected friend is no longer available for this trip. Refresh and update your tagged friends.",
      );
    throw error;
  }
}
