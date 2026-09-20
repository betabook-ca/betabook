"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { projectShareLinks } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { parseProjectShareAudience } from "@/lib/privacy";
import { parseProjectShareExpiry, projectShareExpiryModifier } from "@/lib/project-share";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

import { afterCommit } from "./post-commit";
import { revalidateProjectShare, revalidateProjectSurfaces } from "./revalidation";

const PRIVATE_PROFILE_MESSAGE =
  "Sharing is off while your profile is private — change it in Account settings.";
const NOT_TRACKED_MESSAGE = "Track this climb as a project before sharing it";

/** Publishes one tracked project behind a link, or changes the terms of a link
 * that already exists.
 *
 * Re-sharing keeps the token: tightening the audience or shortening the expiry
 * is a correction to who may read it, not a decision to break the link already
 * sent to the people who may. Stopping entirely is `unshareProject`.
 *
 * The pin check and the private-profile check are conditions on the INSERT
 * rather than reads before it, the way the cap in `pinProject` is. A session
 * carries no `is_private` — it is Better Auth's, not D1's — so a TypeScript
 * check would leave a window where `setUserPrivate` commits first, its trigger
 * deletes nothing because this row does not exist yet, and the link then comes
 * back to life the day the profile is public again.
 */
export async function shareProject(
  climbId: number,
  audience: unknown,
  expiry: unknown,
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(climbId) || climbId < 1) throw new ActionError("Climb not found");
    const shareAudience = parseProjectShareAudience(audience);
    const modifier = projectShareExpiryModifier(parseProjectShareExpiry(expiry));
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

    const db = await getDb();
    const [shared] = await db.all<{ token: string }>(sql`
      INSERT INTO project_share_links (user_id, climb_id, audience, expires_at)
      SELECT p.user_id, p.climb_id, ${shareAudience},
             ${modifier === null ? sql`NULL` : sql`datetime('now', ${modifier})`}
      FROM pinned_projects p
      JOIN user u ON u.id = p.user_id
      WHERE p.user_id = ${user.id} AND p.climb_id = ${climbId} AND u.is_private = 0
      ON CONFLICT (user_id, climb_id) DO UPDATE
        SET audience = excluded.audience, expires_at = excluded.expires_at
      RETURNING token
    `);

    if (!shared) {
      // The select matched nothing: either the climb is not pinned, or the
      // profile is private. Both are the climber's own state, so say which.
      const pinned = await db.get<{ climbId: number }>(sql`
        SELECT climb_id AS climbId FROM pinned_projects
        WHERE user_id = ${user.id} AND climb_id = ${climbId}
      `);
      throw new ActionError(pinned ? PRIVATE_PROFILE_MESSAGE : NOT_TRACKED_MESSAGE);
    }

    afterCommit(() => {
      revalidateProjectShare(shared.token);
      revalidateProjectSurfaces(user.id);
      refresh();
    });
    return { token: shared.token };
  });
}

/** Withdraws the link. The project, its sessions and its send are untouched —
 * only the door closes. Unsharing something that is not shared is not an
 * error: the requested end state already holds. */
export async function unshareProject(climbId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(climbId) || climbId < 1) throw new ActionError("Climb not found");
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

    const db = await getDb();
    // RETURNING, because the token is the cache key for the page it served and
    // there is nothing left to look it up from once the row is gone.
    const removed = await db
      .delete(projectShareLinks)
      .where(and(eq(projectShareLinks.userId, user.id), eq(projectShareLinks.climbId, climbId)))
      .returning({ token: projectShareLinks.token });

    afterCommit(() => {
      for (const { token } of removed) revalidateProjectShare(token);
      revalidateProjectSurfaces(user.id);
      refresh();
    });
  });
}
