import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { userAnalyticsLayouts } from "@/db/schema";
import { DEFAULT_ANALYTICS_LAYOUT, parseAnalyticsLayout } from "@/lib/analytics-layout";

/** Layout preferences are private to their owner, even on a public profile. */
export async function getAnalyticsLayout(db: Database, userId: string, viewerId: string | null) {
  if (!viewerId) return DEFAULT_ANALYTICS_LAYOUT;
  const row = await db
    .select({ layout: userAnalyticsLayouts.layout })
    .from(userAnalyticsLayouts)
    .where(and(eq(userAnalyticsLayouts.userId, userId), eq(userAnalyticsLayouts.userId, viewerId)))
    .get();
  return row ? parseAnalyticsLayout(row.layout) : DEFAULT_ANALYTICS_LAYOUT;
}
