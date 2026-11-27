import type { Database } from "@/db/client";
import { areas, changeRequests, climbs, journalEntries, sends, trips, user } from "@/db/schema";

/** Clear domain fixtures before rebuilding a test's own preconditions.
 * Keep migrations, FTS, and aggregate triggers active during cleanup. */
export async function resetDb(db: Database) {
  await db.delete(changeRequests);
  await db.delete(trips);
  await db.delete(journalEntries);
  await db.delete(sends);
  await db.delete(user);
  await db.delete(climbs);
  await db.update(areas).set({ parentId: null });
  await db.delete(areas);
}
