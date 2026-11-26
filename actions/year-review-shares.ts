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
import { goalToday } from "@/lib/goals";
import { allowJournalWrite } from "@/lib/rate-limit";
import { getRequestTimezone } from "@/lib/request-timezone";
import { requireSession } from "@/lib/session";
import { parseShareExpiry, shareExpiryModifier } from "@/lib/share-expiry";
import { recapYear } from "@/lib/year-in-review/window";

import { afterCommit } from "./post-commit";

const INVALID_YEAR_MESSAGE = "Choose a year to share";

function requireYear(year: unknown, latest: number): number {
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1950 || year > latest) {
    throw new ActionError(INVALID_YEAR_MESSAGE);
  }
  return year;
}

/** The one year the owner's page shows (`recapYear`), so a new link always
 * points at the recap whose Share dialog can renew or revoke it. */
async function requireShareableYear(year: unknown): Promise<number> {
  const shown = recapYear(goalToday(await getRequestTimezone()));
  if (year !== shown) throw new ActionError(INVALID_YEAR_MESSAGE);
  return shown;
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
    const recapYear = await requireShareableYear(year);
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
    // Any stored year can be revoked, including one shared before the
    // current-year cap existed.
    const recapYear = requireYear(year, 9999);
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
