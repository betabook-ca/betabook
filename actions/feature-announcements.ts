"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { featureAnnouncementDismissals } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { FEATURE_ANNOUNCEMENTS } from "@/lib/feature-announcements";
import { requireSession } from "@/lib/session";

/** Stable release IDs must not change when announcement copy changes. */
export async function dismissFeatureAnnouncement(featureId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const feature = FEATURE_ANNOUNCEMENTS.find((candidate) => candidate.featureId === featureId);
    if (!feature) {
      throw new ActionError("Invalid feature announcement.");
    }
    const db = await getDb();
    await db
      .insert(featureAnnouncementDismissals)
      .values({ userId: session.user.id, featureId })
      .onConflictDoNothing();
    // Each rollout refreshes only the page that reads its dismissal state.
    revalidatePath(feature.page.replace("[id]", session.user.id));
  });
}
