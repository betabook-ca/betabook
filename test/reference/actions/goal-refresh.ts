import { after } from "next/server";

import type { Database } from "@/db/client";
import { refreshGoalsAfterWrite } from "@/db/queries/goals";

/** The next owner write or Goals visit retries a failed post-response refresh. */
export async function scheduleGoalRefresh(db: Database, ownerId: string): Promise<void> {
  try {
    after(() => refreshGoalsAfterWrite(db, ownerId));
  } catch (error) {
    console.error("Saved successfully; goal events will refresh on the next owner activity", error);
  }
}
