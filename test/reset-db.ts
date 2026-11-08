import type { Database } from "@/db/client";
import { areas, changeRequests, climbs, journalEntries, sends, trips, user } from "@/db/schema";

/** Clear domain fixtures before rebuilding a test's own preconditions.
 * Keep migrations, FTS, and aggregate triggers active during cleanup. */
export async function resetDb(db: Database) {
  await db.batch([
    db.delete(changeRequests),
    db.delete(trips),
    db.delete(journalEntries),
    db.delete(sends),
    db.delete(user),
    db.delete(climbs),
    db.update(areas).set({ parentId: null }),
    db.delete(areas),
  ]);
}
