import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goalToday, type GoalProgress } from "@/lib/goals";

function achievementIdentity(goal: Pick<GoalProgress, "id" | "periodStart" | "repeat">) {
  return `${goal.id}:${goal.periodStart}:${goal.repeat}`;
}

/** Owner reads detect achievements once. Pre-feature history is baselined silently. */
export async function unseenGoalAchievements(
  db: Database,
  ownerId: string,
  periods: GoalProgress[],
  now: Date,
) {
  const definitions = await db.all<{ id: number; initialized: number }>(
    sql`SELECT id,celebrations_initialized AS initialized FROM goals WHERE user_id=${ownerId}`,
  );
  if (definitions.length === 0) return [];
  const initialized = new Map(definitions.map((goal) => [goal.id, Boolean(goal.initialized)]));
  const existing = await db.all<{
    id: number;
    periodStart: string;
    repeat: GoalProgress["repeat"];
    acknowledgedAt: string | null;
  }>(
    sql`SELECT a.goal_id AS id,a.period_start AS periodStart,a.repeat,a.acknowledged_at AS acknowledgedAt FROM goal_achievements a JOIN goals g ON g.id=a.goal_id WHERE g.user_id=${ownerId}`,
  );
  const known = new Map(existing.map((goal) => [achievementIdentity(goal), goal]));
  const completed = periods.filter(
    (goal) =>
      goal.completedDate &&
      goal.completedDate <= goalToday(goal.timezone, now) &&
      goal.progress >= goal.target,
  );
  const missing = completed.filter((goal) => !known.has(achievementIdentity(goal)));
  for (let offset = 0; offset < missing.length; offset += 200) {
    const batch = JSON.stringify(
      missing
        .slice(offset, offset + 200)
        .map(({ id, periodStart, repeat }) => ({ id, periodStart, repeat })),
    );
    await db.run(sql`INSERT INTO goal_achievements (goal_id,period_start,repeat,detected_at,acknowledged_at)
      SELECT g.id,json_extract(item.value,'$.periodStart'),json_extract(item.value,'$.repeat'),${now.toISOString()},CASE WHEN g.celebrations_initialized=0 THEN ${now.toISOString()} ELSE NULL END
      FROM json_each(${batch}) item JOIN goals g ON g.id=json_extract(item.value,'$.id') WHERE g.user_id=${ownerId}
      ON CONFLICT DO NOTHING`);
  }
  const pending = completed.filter(
    (goal) =>
      initialized.get(goal.id) &&
      (!known.has(achievementIdentity(goal)) ||
        known.get(achievementIdentity(goal))?.acknowledgedAt === null),
  );
  await db.run(
    sql`UPDATE goals SET celebrations_initialized=1 WHERE user_id=${ownerId} AND celebrations_initialized=0`,
  );
  // Re-read acknowledgements so another tab/device cannot revive an already dismissed notice.
  const unread = await db.all<{ id: number; periodStart: string; repeat: GoalProgress["repeat"] }>(
    sql`SELECT a.goal_id AS id,a.period_start AS periodStart,a.repeat FROM goal_achievements a JOIN goals g ON g.id=a.goal_id WHERE g.user_id=${ownerId} AND a.acknowledged_at IS NULL`,
  );
  const unreadKeys = new Set(unread.map(achievementIdentity));
  return pending.filter((goal) => unreadKeys.has(achievementIdentity(goal)));
}
