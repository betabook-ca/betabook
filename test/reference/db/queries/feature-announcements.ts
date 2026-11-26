import { and, eq, inArray } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import { featureAnnouncementDismissals } from "@/db/schema";
import {
  FEATURE_ANNOUNCEMENTS,
  getAnnouncementCandidates,
  type FeatureAnnouncementDefinition,
} from "@/lib/feature-announcements";
import { requestMemo } from "@/lib/request-memo";

/** One indexed read for this viewer and the eligible IDs, with no per-feature queries. */
export async function getDismissedFeatureAnnouncementIds(
  db: Database,
  userId: string,
  featureIds: readonly string[],
): Promise<string[]> {
  if (featureIds.length === 0) return [];
  const rows = await db
    .select({ featureId: featureAnnouncementDismissals.featureId })
    .from(featureAnnouncementDismissals)
    .where(
      and(
        eq(featureAnnouncementDismissals.userId, userId),
        inArray(featureAnnouncementDismissals.featureId, [...featureIds]),
      ),
    );
  return rows.map((row) => row.featureId);
}

/** Load the viewer's releases before page data determines which targets are visible. */
export async function loadViewerFeatureAnnouncements(
  db: Database,
  viewer: { id: string; createdAt: Date },
  {
    now = new Date(),
    definitions = FEATURE_ANNOUNCEMENTS,
  }: {
    now?: Date;
    definitions?: readonly FeatureAnnouncementDefinition[];
  } = {},
): Promise<FeatureAnnouncementDefinition[]> {
  const candidates = getAnnouncementCandidates(definitions, {
    userCreatedAt: viewer.createdAt,
    now,
  });
  const dismissed = new Set(
    await getDismissedFeatureAnnouncementIds(
      db,
      viewer.id,
      candidates.map((feature) => feature.featureId),
    ),
  );
  return candidates.filter((feature) => !dismissed.has(feature.featureId));
}

// Primitive keys share one read across a request's callers, never across requests.
export const getViewerFeatureAnnouncements = requestMemo(
  async (userId: string, createdAt: number) =>
    loadViewerFeatureAnnouncements(await getDb(), { id: userId, createdAt: new Date(createdAt) }),
);
