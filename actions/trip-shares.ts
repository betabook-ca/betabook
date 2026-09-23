"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { tripShareLinks } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { parseShareExpiry, shareExpiryModifier } from "@/lib/share-expiry";

import { afterCommit } from "./post-commit";
import { revalidateTripSurfaces } from "./revalidation";

const PRIVATE_PROFILE_MESSAGE =
  "Sharing is off while your profile is private — change it in Account settings.";
const TRIP_NOT_FOUND = "Trip not found";

/** Publishes one trip behind a link, or resets the clock on a link that
 * already exists.
 *
 * The link has no audience: whoever holds the URL can open it. Re-sharing
 * keeps the token, so extending a link does not break the one already sent to
 * the people it was meant for. Stopping entirely is `unshareTrip`.
 *
 * The ownership check and the private-profile check are conditions on the
 * INSERT rather than reads before it. A session carries no `is_private` — it
 * is Better Auth's, not D1's — so a TypeScript check would leave a window
 * where `setUserPrivate` commits first, its trigger deletes nothing because
 * this row does not exist yet, and the link then comes back to life the day
 * the profile is public again.
 */
export async function shareTrip(
  tripId: number,
  expiry: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(tripId) || tripId < 1) throw new ActionError(TRIP_NOT_FOUND);
    const modifier = shareExpiryModifier(parseShareExpiry(expiry));
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

    const db = await getDb();
    // The deadline comes back rather than being recomputed on the client: it
    // was written by datetime('now', …) on the database's clock, and the
    // dialog reports when the link actually dies, not when it thinks it will.
    const [shared] = await db.all<{ token: string; expiresAt: string | null }>(sql`
      INSERT INTO trip_share_links (user_id, trip_id, expires_at)
      SELECT t.user_id, t.id,
             ${modifier === null ? sql`NULL` : sql`datetime('now', ${modifier})`}
      FROM trips t
      JOIN user u ON u.id = t.user_id
      WHERE t.user_id = ${user.id} AND t.id = ${tripId} AND u.is_private = 0
      ON CONFLICT (user_id, trip_id) DO UPDATE SET expires_at = excluded.expires_at
      RETURNING token, expires_at AS expiresAt
    `);

    if (!shared) {
      // The select matched nothing: either the trip is not this climber's, or
      // the profile is private. Both are the climber's own state, so say
      // which — but only after proving the trip is theirs, so a guessed id
      // cannot be used to learn whether someone else's profile is private.
      const own = await db.get<{ id: number }>(sql`
        SELECT id FROM trips WHERE user_id = ${user.id} AND id = ${tripId}
      `);
      throw new ActionError(own ? PRIVATE_PROFILE_MESSAGE : TRIP_NOT_FOUND);
    }

    afterCommit(() => {
      revalidateTripSurfaces(user.id);
      refresh();
    });
    return { token: shared.token, expiresAt: shared.expiresAt };
  });
}

/** Withdraws the link. The trip, its entries and its sends are untouched —
 * only the door closes. Unsharing something that is not shared is not an
 * error: the requested end state already holds. */
export async function unshareTrip(tripId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(tripId) || tripId < 1) throw new ActionError(TRIP_NOT_FOUND);
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

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
