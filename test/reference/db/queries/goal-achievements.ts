import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goalAchievements, goals } from "@/db/schema";
import { goalToday, type GoalProgress } from "@/lib/goals";

function achievementIdentity(goal: Pick<GoalProgress, "id" | "periodStart" | "repeat">) {
  return `${goal.id}:${goal.periodStart}:${goal.repeat}`;
}

/** These statements must share the batch that reconciles the completion projection. */
export function goalAchievementStatements(db: Database, goalIds: SQL, now: Date) {
  return [
    db
      .insert(goalAchievements)
      .select(sql`SELECT g.id,c.period_start,c.repeat,${now.toISOString()},
        CASE WHEN g.celebrations_initialized=0 THEN ${now.toISOString()} ELSE NULL END
        FROM goal_completions c JOIN goals g ON g.id=c.goal_id
        WHERE g.id IN (${goalIds}) AND c.completed_date IS NOT NULL`)
      .onConflictDoNothing(),
    db
      .update(goals)
      .set({ celebrationsInitialized: true })
      .where(sql`id IN (${goalIds}) AND celebrations_initialized=0`),
  ] as const;
}

/** Read notices only while their persisted completion is still valid. */
export async function unseenGoalAchievements(
  db: Database,
  ownerId: string,
  periods: GoalProgress[],
  now: Date,
) {
  if (periods.length === 0) return [];
  // Match last-reconciled events against the live periods supplied by Goals.
  // Recheck acknowledgements before returning notices.
  const unread = await db.all<{
    id: number;
    periodStart: string;
    repeat: GoalProgress["repeat"];
    completedDate: string;
  }>(sql`SELECT c.goal_id AS id,c.period_start AS periodStart,c.repeat,
      c.completed_date AS completedDate
    FROM goal_completions c JOIN goals g ON g.id=c.goal_id
    JOIN goal_achievements a ON a.goal_id=c.goal_id AND a.period_start=c.period_start AND a.repeat=c.repeat
    WHERE g.user_id=${ownerId} AND c.completed_date IS NOT NULL AND a.acknowledged_at IS NULL`);
  const current = new Map(unread.map((goal) => [achievementIdentity(goal), goal]));
  return periods.filter((goal) => {
    const completion = current.get(achievementIdentity(goal));
    return (
      goal.completedDate !== null &&
      goal.completedDate <= goalToday(goal.timezone, now) &&
      goal.progress >= goal.target &&
      completion?.completedDate === goal.completedDate
    );
  });
}
