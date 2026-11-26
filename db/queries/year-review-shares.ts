import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/db/client";

import { shareLinkLiveSql, shareLinkReadableSql } from "./share-links";

/** Why a year link did not resolve. `hidden` covers "no such token" and "the
 * owner went private" alike. An expired link (its deadline passed, or its
 * year is no longer the recap year) names its owner and year so the owner
 * can be sent to their own recap. */
export type SharedYearReviewAccess =
  | { status: "hidden" }
  | { status: "expired"; ownerId: string; year: number }
  | {
      status: "visible";
      owner: { id: string; name: string; image: string | null };
      year: number;
    };

/** The recap year as of now, in UTC: last year until March 1, then this
 * year. The same rollover as `recapYear` in lib/year-in-review/window.ts,
 * read from the database clock so every viewer agrees on it. */
const recapYearSql = sql`(CAST(strftime('%Y', 'now') AS INTEGER)
  - (CASE WHEN CAST(strftime('%m', 'now') AS INTEGER) < 3 THEN 1 ELSE 0 END))`;

/** A year link is readable like any share link, and only while its year is
 * still the recap year: every link expires when the year changes over. */
const yearLinkReadableSql = sql`${shareLinkReadableSql} AND link.year = ${recapYearSql}`;

/** True when `token` is a live link of the climber in `ownerColumn`. Every
 * read of a shared recap's rows puts this in its WHERE. */
export function yearLinkCoversSql(token: string, ownerColumn: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM year_review_share_links link
    JOIN user share_owner ON share_owner.id = link.user_id
    WHERE link.token = ${token} AND link.user_id = ${ownerColumn}
      AND ${yearLinkReadableSql}
  )`;
}

/** Resolves a token to its owner and year, or says why it can't. */
export async function getSharedYearReview(
  db: Database,
  token: string,
): Promise<SharedYearReviewAccess> {
  const row = await db.get<{
    readable: number;
    ownerIsPrivate: number;
    ownerId: string;
    ownerName: string;
    ownerImage: string | null;
    year: number;
  }>(sql`
    SELECT (${yearLinkReadableSql}) AS readable, share_owner.is_private AS ownerIsPrivate,
      share_owner.id AS ownerId, share_owner.name AS ownerName,
      share_owner.image AS ownerImage, link.year AS year
    FROM year_review_share_links link
    JOIN user share_owner ON share_owner.id = link.user_id
    WHERE link.token = ${token}
  `);
  if (!row) return { status: "hidden" };
  if (row.readable !== 1) {
    return row.ownerIsPrivate === 1
      ? { status: "hidden" }
      : { status: "expired", ownerId: row.ownerId, year: row.year };
  }
  return {
    status: "visible",
    owner: { id: row.ownerId, name: row.ownerName, image: row.ownerImage },
    year: row.year,
  };
}

/** The owner's own live link for a year, for the Share dialog. An expired
 * link reads as none, on the same comparison as the readable predicate. */
export async function getYearReviewShareForOwner(
  db: Database,
  ownerId: string,
  year: number,
): Promise<{ token: string; expiresAt: string | null } | null> {
  const row = await db.get<{ token: string; expiresAt: string | null }>(sql`
    SELECT token, expires_at AS expiresAt
    FROM year_review_share_links link WHERE user_id = ${ownerId} AND year = ${year}
      AND ${shareLinkLiveSql(sql`expires_at`)} AND link.year = ${recapYearSql}
  `);
  return row ?? null;
}
