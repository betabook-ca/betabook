import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db/client";
import { tripCompanions } from "@/db/schema";
import { ActionError, errorChainIncludes } from "@/lib/action-result";

/** The trip the statement before this one inserted, over an aliased `t`. That
 * insert writes nothing once the climber is at their limit, which leaves
 * `last_insert_rowid()` on whatever this connection inserted before it, so
 * `changes()` is what says the id is the new trip's. */
export const NEW_TRIP = sql`t.id = last_insert_rowid() AND changes() > 0`;

/** Tags `ids` on the trips `trip` selects, of those `ownerId` owns.
 * MATERIALIZED captures the id once, before the inserts below move
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

/** Tombstones of friends who removed themselves are never deleted, so the
 * insert guard can keep refusing to tag them again. */
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
