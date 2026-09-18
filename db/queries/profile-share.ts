import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { profileShareLinks, user } from "@/db/schema";

export async function getProfileShareToken(db: Database, userId: string) {
  const row = await db
    .select({ token: profileShareLinks.token })
    .from(profileShareLinks)
    .where(eq(profileShareLinks.userId, userId))
    .get();
  return row?.token ?? null;
}

/** Only a current token on a profile that isn't private names its owner. */
export async function getShareLinkOwner(db: Database, token: string) {
  const row = await db
    .select({
      id: user.id,
      name: user.name,
      // Honors the Show photo setting, like shownUserImageSql does for the
      // raw-SQL reads. A share-link holder sees the same avatar a member does.
      image: sql<string | null>`CASE WHEN ${user.showProfilePhoto} THEN ${user.image} END`,
    })
    .from(profileShareLinks)
    .innerJoin(user, eq(user.id, profileShareLinks.userId))
    .where(and(eq(profileShareLinks.token, token), eq(user.isPrivate, false)))
    .get();
  return row ?? null;
}
