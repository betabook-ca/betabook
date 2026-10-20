"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { tripShareLinks } from "@/db/schema";
import {
  ActionError,
  JOURNAL_RATE_LIMIT_MESSAGE,
  PRIVATE_PROFILE_MESSAGE,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { parseShareExpiry, shareExpiryModifier } from "@/lib/share-expiry";
import { requirePositiveId } from "@/lib/validation";

import { afterCommit } from "./post-commit";
import { revalidateTripSurfaces } from "./revalidation";

const TRIP_NOT_FOUND_MESSAGE = "Trip not found";

/** Publishes one trip behind a link, or resets the clock on a link that
 * already exists.
 *
 * The link has no audience: whoever holds the URL can open it. Renewing a live
 * link keeps the token, so extending it does not break the one already sent.
 * Sharing again once a link has expired makes a new token instead: an owner
 * may have let a link that got away expire on purpose, and every copy of it
 * has to stay dead. Stopping entirely is `unshareTrip`.
 *
 * The ownership check and the private-profile check are conditions on the
 * INSERT rather than reads before it, as in `shareProject`. A session carries
 * no `is_private`, so a TypeScript check would leave a window where
 * `setUserPrivate` commits first, its trigger deletes nothing because this row
 * does not exist yet, and the link comes back to life the day the profile is
 * public again.
 */
export async function shareTrip(
  tripId: number,
  expiry: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    requirePositiveId(tripId, TRIP_NOT_FOUND_MESSAGE);
    const modifier = shareExpiryModifier(parseShareExpiry(expiry));
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const db = await getDb();
    // The deadline comes back from the database's clock, so the dialog
    // reports when the link actually dies.
    const [shared] = await db.all<{ token: string; expiresAt: string | null }>(sql`
      INSERT INTO trip_share_links (user_id, trip_id, expires_at)
      SELECT t.user_id, t.id,
             ${modifier === null ? sql`NULL` : sql`datetime('now', ${modifier})`}
      FROM trips t
      JOIN user u ON u.id = t.user_id
      WHERE t.user_id = ${user.id} AND t.id = ${tripId} AND u.is_private = 0
      -- SET expressions read the row as it was, so this asks whether the
      -- link had expired before this write.
      ON CONFLICT (user_id, trip_id) DO UPDATE SET
        token = CASE
          WHEN trip_share_links.expires_at IS NOT NULL
            AND trip_share_links.expires_at <= datetime('now')
          THEN lower(hex(randomblob(16)))
          ELSE trip_share_links.token
        END,
        expires_at = excluded.expires_at
      RETURNING token, expires_at AS expiresAt
    `);

    if (!shared) {
      // Nothing matched: the trip is not this climber's, or the profile is
      // private. Say which only after proving the trip is theirs, so a guessed
      // id cannot be used to learn whether someone else's profile is private.
      const own = await db.get<{ id: number }>(sql`
        SELECT id FROM trips WHERE user_id = ${user.id} AND id = ${tripId}
      `);
      throw new ActionError(own ? PRIVATE_PROFILE_MESSAGE : TRIP_NOT_FOUND_MESSAGE);
    }

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
    return { token: shared.token, expiresAt: shared.expiresAt };
  });
}

/** Withdraws the link. The trip and everything logged in it are untouched —
 * only the door closes. Unsharing something that is not shared is not an
 * error: the requested end state already holds. Not rate-limited: revoking
 * only reduces what is exposed, and an owner who sent a link to the wrong
 * place must be able to close it at once. */
export async function unshareTrip(tripId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    requirePositiveId(tripId, TRIP_NOT_FOUND_MESSAGE);

    const db = await getDb();
    await db
      .delete(tripShareLinks)
      .where(and(eq(tripShareLinks.userId, user.id), eq(tripShareLinks.tripId, tripId)));

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
  });
}
