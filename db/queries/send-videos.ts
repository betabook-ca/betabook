import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import type { AscentStyle } from "@/lib/sends";

import { sendCommentVisibleSql } from "./content-access";

/** How many videos a climb page gathers above its send list. */
const CLIMB_VIDEO_LIMIT = 8;

/** A climb's send video with just enough to caption it. Carries no send id:
 * the signed-out page lists these too, and public send rows never expose one. */
export type ClimbVideo = {
  videoUrl: string;
  /** Null for a signed-out viewer, who can't open profiles. */
  userId: string | null;
  userName: string;
  userImage: string | null;
  ascentStyle: AscentStyle;
  dateSent: string | null;
};

export type ClimbVideos = { videos: ClimbVideo[]; total: number };

/** The newest videos on a climb that `viewerId` may watch, and how many there
 * are in all. A video follows its send's commentary audience — the same
 * predicate that names a send and shows its note — so a signed-out (null)
 * viewer sees only videos shared with Everyone from public profiles, and a
 * private profile's video never reaches anyone but its owner. */
export async function getClimbVideos(
  db: Database,
  climbId: number,
  viewerId: string | null,
  limit: number = CLIMB_VIDEO_LIMIT,
): Promise<ClimbVideos> {
  const rows = await db.all<ClimbVideo & { total: number }>(sql`
    SELECT
      sends.video_url AS videoUrl,
      CASE WHEN ${viewerId} IS NOT NULL THEN sends.user_id END AS userId,
      user.name AS userName,
      user.image AS userImage,
      sends.ascent_style AS ascentStyle,
      sends.date_sent AS dateSent,
      count(*) OVER () AS total
    FROM sends
    JOIN user ON user.id = sends.user_id
    WHERE sends.climb_id = ${climbId}
      AND sends.video_url IS NOT NULL
      AND ${sendCommentVisibleSql(viewerId, sql`sends.user_id`)}
    ORDER BY sends.date_sent DESC, sends.id ASC
    LIMIT ${limit}
  `);
  return {
    videos: rows.map(({ total: _total, ...video }) => video),
    total: rows[0]?.total ?? 0,
  };
}
