import { and, desc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { profileShareLinks, recapShares, user } from "@/db/schema";
import { newRecapToken, parseRecapToken, type RecapSnapshot } from "@/lib/recap-share";

/** Fresh consent check for issuing a public recap, never a session snapshot. */
export async function getPublicProfileTokenForRecap(db: Database, userId: string) {
  const row = await db
    .select({ token: profileShareLinks.token, name: user.name })
    .from(profileShareLinks)
    .innerJoin(user, eq(user.id, profileShareLinks.userId))
    .where(and(eq(user.id, userId), eq(user.isPrivate, false)))
    .get();
  return row ?? null;
}

/** A separate bearer grant for exactly one frozen recap. */
export async function createRecapShare(
  db: Database,
  userId: string,
  profileToken: string,
  snapshot: RecapSnapshot,
) {
  const token = newRecapToken();
  await db.insert(recapShares).values({ token, userId, profileToken, snapshot });
  return token;
}

/** Reopening the dialog without changing the recap reuses its last grant
 * instead of writing another identical snapshot. */
export async function getMatchingRecapShareToken(
  db: Database,
  userId: string,
  profileToken: string,
  snapshot: RecapSnapshot,
): Promise<string | null> {
  const latest = await db
    .select({ token: recapShares.token, snapshot: recapShares.snapshot })
    .from(recapShares)
    .where(and(eq(recapShares.userId, userId), eq(recapShares.profileToken, profileToken)))
    .orderBy(desc(recapShares.createdAt))
    .limit(1)
    .get();
  return latest &&
    JSON.stringify({ owner: latest.snapshot.owner, stats: latest.snapshot.stats }) ===
      JSON.stringify({ owner: snapshot.owner, stats: snapshot.stats })
    ? latest.token
    : null;
}

/** Reading a snapshot still checks current profile consent. Old tokens stop
 * resolving after a privacy toggle or profile-link reset. */
export async function getRecapShare(db: Database, token: string) {
  if (!parseRecapToken(token)) return null;
  const row = await db
    .select({
      snapshot: recapShares.snapshot,
      ownerId: user.id,
    })
    .from(recapShares)
    .innerJoin(user, eq(user.id, recapShares.userId))
    .innerJoin(profileShareLinks, eq(profileShareLinks.userId, user.id))
    .where(
      and(
        eq(recapShares.token, token),
        eq(user.isPrivate, false),
        eq(recapShares.profileToken, profileShareLinks.token),
      ),
    )
    .get();
  return row ?? null;
}
