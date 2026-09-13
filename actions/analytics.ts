"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { userAnalyticsLayouts } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { analyticsLayoutSchema, type AnalyticsLayout } from "@/lib/analytics-layout";
import { requireSession } from "@/lib/session";

/** The target always comes from the session; clients cannot choose another account. */
export async function saveAnalyticsLayout(layout: AnalyticsLayout): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const parsed = analyticsLayoutSchema.safeParse(layout);
    if (!parsed.success) {
      throw new ActionError("This layout could not be saved. Restore defaults and try again.");
    }
    const db = await getDb();
    await db
      .insert(userAnalyticsLayouts)
      .values({ userId: session.user.id, layout: parsed.data })
      .onConflictDoUpdate({ target: userAnalyticsLayouts.userId, set: { layout: parsed.data } });
    revalidatePath(`/users/${session.user.id}/analytics`);
  });
}
