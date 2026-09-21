"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getDb } from "@/db/client";
import {
  createRecapShare,
  getAnalyticsHighlightSessions,
  getMatchingRecapShareToken,
  getJournalSessionsForAnalytics,
  getPublicProfileTokenForRecap,
  getUserSendsForRecap,
} from "@/db/queries";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { recapSharePath, type RecapSnapshot } from "@/lib/recap-share";
import { requireSession } from "@/lib/session";
import { buildSocialCardStats, isYearInReviewMonth } from "@/lib/social-card";
import { getUserInitials } from "@/lib/user-initials";

/** Prepare a share before the tap that opens Android's native share sheet;
 * awaiting a server round trip inside that tap would lose user activation. */
export async function prepareRecapShare(): Promise<ActionResult<{ token: string; path: string }>> {
  return toActionResult(async () => {
    const session = await requireSession();
    const { cf } = await getCloudflareContext({ async: true });
    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: cf?.timezone ?? "UTC" }).format(now);
    if (!isYearInReviewMonth(today)) {
      throw new ActionError("Year in review is available in December.");
    }
    const period = "year";
    const db = await getDb();
    const owner = await getPublicProfileTokenForRecap(db, session.user.id);
    if (!owner) throw new ActionError("Make your profile public to share a linked recap.");

    const [sends, journalSessions, highlightSessions] = await Promise.all([
      getUserSendsForRecap(db, session.user.id),
      getJournalSessionsForAnalytics(db, session.user.id, session.user.id),
      getAnalyticsHighlightSessions(db, session.user.id, session.user.id, []),
    ]);
    const snapshot: RecapSnapshot = {
      version: 1,
      createdAt: now.toISOString(),
      owner: { name: owner.name, initials: getUserInitials(owner.name) },
      stats: buildSocialCardStats(sends, journalSessions, period, today, highlightSessions),
    };
    const token =
      (await getMatchingRecapShareToken(db, session.user.id, owner.token, snapshot)) ??
      (await createRecapShare(db, session.user.id, owner.token, snapshot));
    return { token, path: recapSharePath(token) };
  });
}
