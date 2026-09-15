import { after } from "next/server";

import type { Database } from "@/db/client";
import { refreshGoalsAfterWrite } from "@/db/queries/goals";

/** Dirty state is persisted by source triggers; cron retries interrupted callbacks. */
export async function scheduleGoalRefresh(db: Database, ownerId: string): Promise<void> {
  try {
    after(() => refreshGoalsAfterWrite(db, ownerId));
  } catch (error) {
    console.error("Saved successfully; goal refresh will be retried by maintenance", error);
  }
}
