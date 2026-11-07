"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { climbListShareLinks } from "@/db/schema";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  PRIVATE_PROFILE_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { CLIMB_LIST_NOT_FOUND_MESSAGE } from "@/lib/climb-lists";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { parseShareExpiry, shareExpiryModifier } from "@/lib/share-expiry";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateClimbListSurfaces } from "./revalidation";

/** Publishes one list behind a link, or resets the clock on a live one.
 *
 * As with `shareTrip`: the link has no audience, renewing a live link keeps
 * its token, and sharing again once it expired makes a new token so every
 * copy of the old one stays dead. Ownership and the private-profile check are
 * conditions on the INSERT, so a profile closing at the same moment cannot
 * leave a link that comes back to life later. */
export async function shareClimbList(
  listId: number,
  expiry: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);
    const modifier = shareExpiryModifier(parseShareExpiry(expiry));
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const db = await getDb();
    const [shared] = await db.all<{ token: string; expiresAt: string | null }>(sql`
      INSERT INTO climb_list_share_links (user_id, list_id, expires_at)
      SELECT l.user_id, l.id,
             ${modifier === null ? sql`NULL` : sql`datetime('now', ${modifier})`}
      FROM climb_lists l
      JOIN user u ON u.id = l.user_id
      WHERE l.user_id = ${user.id} AND l.id = ${id} AND u.is_private = 0
      ON CONFLICT (user_id, list_id) DO UPDATE SET
        token = CASE
          WHEN climb_list_share_links.expires_at IS NOT NULL
            AND climb_list_share_links.expires_at <= datetime('now')
          THEN lower(hex(randomblob(16)))
          ELSE climb_list_share_links.token
        END,
        expires_at = excluded.expires_at
      RETURNING token, expires_at AS expiresAt
    `);

    if (!shared) {
      const own = await db.get<{ id: number }>(sql`
        SELECT id FROM climb_lists WHERE user_id = ${user.id} AND id = ${id}
      `);
      throw new ActionError(own ? PRIVATE_PROFILE_MESSAGE : CLIMB_LIST_NOT_FOUND_MESSAGE);
    }

    afterCommit(() => {
      revalidateClimbListSurfaces(user.id, id);
      refresh();
    });
    return { token: shared.token, expiresAt: shared.expiresAt };
  });
}

/** Withdraws the link and nothing else. Not rate-limited: an owner who sent a
 * link to the wrong place must be able to close it at once. */
export async function unshareClimbList(listId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const id = requirePositiveId(listId, CLIMB_LIST_NOT_FOUND_MESSAGE);

    const db = await getDb();
    await db
      .delete(climbListShareLinks)
      .where(and(eq(climbListShareLinks.userId, user.id), eq(climbListShareLinks.listId, id)));

    afterCommit(() => {
      revalidateClimbListSurfaces(user.id, id);
      refresh();
    });
  });
}
