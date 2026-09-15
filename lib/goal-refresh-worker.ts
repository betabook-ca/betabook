import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { refreshGoalAchievements } from "@/db/queries/goals";
import { goalToday } from "@/lib/goals";

// At most 20 owners/run; a backlog of 400 owners takes at least 20 scheduled runs.
// Per-owner refresh uses a bounded number of SQL statements, independent of goal count.
const MAX_OWNERS_PER_RUN = 20;

/** Dirty flags and due dates are the durable queue. Persist attempts before work so
 * a failed or interrupted owner moves behind owners that have not been tried. */
export async function refreshDirtyGoalOwners(
  db: Database,
  now = new Date(),
  ownerLimit = MAX_OWNERS_PER_RUN,
) {
  if (!Number.isSafeInteger(ownerLimit) || ownerLimit < 1)
    throw new RangeError("Owner limit must be a positive integer.");
  const limit = Math.min(ownerLimit, MAX_OWNERS_PER_RUN);
  const zones = await db.all<{ timezone: string }>(
    sql`SELECT DISTINCT timezone FROM goals WHERE progress_refresh_date IS NOT NULL`,
  );
  const civilDates = Object.fromEntries(
    zones.map(({ timezone }) => [timezone, goalToday(timezone, now)]),
  );
  const dates = JSON.stringify(civilDates);
  let latestToday = "";
  for (const date of Object.values(civilDates)) if (date > latestToday) latestToday = date;
  const pending = sql`(progress_dirty=1 OR progress_refresh_date <= json_extract(${dates}, '$."' || timezone || '"'))`;
  const owners = await db.all<{ userId: string }>(sql`
    WITH pending AS (
      SELECT user_id,progress_refresh_attempted_at FROM goals WHERE progress_dirty=1
      UNION ALL
      SELECT user_id,progress_refresh_attempted_at FROM goals
      WHERE progress_dirty=0 AND progress_refresh_date<=${latestToday}
        AND progress_refresh_date <= json_extract(${dates}, '$."' || timezone || '"')
    ) SELECT user_id AS userId FROM pending
    GROUP BY user_id ORDER BY min(COALESCE(progress_refresh_attempted_at,0)),user_id
    LIMIT ${limit}`);
  const result = { attempted: 0, refreshed: 0, failed: 0 };
  for (const { userId } of owners) {
    const stamped = await db.run(sql`UPDATE goals
      SET progress_refresh_attempted_at=max(COALESCE(progress_refresh_attempted_at,0),${now.valueOf()})
      WHERE user_id=${userId} AND ${pending}`);
    if (stamped.meta.changes === 0) continue;
    result.attempted += 1;
    try {
      await refreshGoalAchievements(db, userId, now);
      result.refreshed += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Goal projection recovery failed; queued for retry", { userId, error });
    }
  }
  return result;
}
