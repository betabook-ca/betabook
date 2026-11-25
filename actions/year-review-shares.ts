"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { yearReviewShareLinks } from "@/db/schema";
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

import { afterCommit } from "./post-commit";

const INVALID_YEAR_MESSAGE = "Choose a year to share";

function requireRecapYear(year: unknown): number {
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1950 || year > 9999) {
    throw new ActionError(INVALID_YEAR_MESSAGE);
  }
  return year;
}

/** Publishes one year's recap behind a link, or resets the clock on a link
 * that already exists. Renewing a live link keeps the token; sharing again
 * after it expired makes a new one, so a link the owner let lapse stays dead.
 * The private-profile check is a condition on the INSERT, as in `shareTrip`,
 * so a link can't be written in the moment the profile closes. */
export async function shareYearReview(
  year: number,
  expiry: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const recapYear = requireRecapYear(year);
    const modifier = shareExpiryModifier(parseShareExpiry(expiry));
    if (!(await allowJournalWrite(user.id))) throw new ActionError(JOURNAL_RATE_LIMIT_MESSAGE);

    const db = await getDb();
    const [shared] = await db.all<{ token: string; expiresAt: string | null }>(sql`
      INSERT INTO year_review_share_links (user_id, year, expires_at)
      SELECT u.id, ${recapYear},
             ${modifier === null ? sql`NULL` : sql`datetime('now', ${modifier})`}
      FROM user u
      WHERE u.id = ${user.id} AND u.is_private = 0
      ON CONFLICT (user_id, year) DO UPDATE SET
        token = CASE
          WHEN year_review_share_links.expires_at IS NOT NULL
            AND year_review_share_links.expires_at <= datetime('now')
          THEN lower(hex(randomblob(16)))
          ELSE year_review_share_links.token
        END,
        expires_at = excluded.expires_at
      RETURNING token, expires_at AS expiresAt
    `);
    if (!shared) throw new ActionError(PRIVATE_PROFILE_MESSAGE);

    afterCommit(() => {
      revalidatePath(`/users/${user.id}/year/${recapYear}`);
      refresh();
    });
    return { token: shared.token, expiresAt: shared.expiresAt };
  });
}

/** Withdraws the link. Not rate-limited: revoking only reduces exposure. */
export async function unshareYearReview(year: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    const recapYear = requireRecapYear(year);
    const db = await getDb();
    await db
      .delete(yearReviewShareLinks)
      .where(
        and(eq(yearReviewShareLinks.userId, user.id), eq(yearReviewShareLinks.year, recapYear)),
      );
    afterCommit(() => {
      revalidatePath(`/users/${user.id}/year/${recapYear}`);
      refresh();
    });
  });
}
