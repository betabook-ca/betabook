import type { SQL } from "drizzle-orm";

import { companionTagsJsonSql } from "./journal-companions";

/** Same as `companionsJsonSql`, for trips. Tags are visible to anyone who can
 * read the trip owner's journal. A tag is hidden after the friend removes it or
 * the friendship ends. */
export function tripCompanionsJsonSql(viewerId: string | null, tripId: SQL): SQL {
  return companionTagsJsonSql("trip", viewerId, tripId);
}
