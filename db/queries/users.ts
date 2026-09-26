import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { user, userProductTours } from "@/db/schema";

import { literalPrefixCondition } from "./shared";

export async function getUser(db: Database, id: string) {
  return db.select().from(user).where(eq(user.id, id)).get();
}

/** A climber as their profile pages read them — the header's fields and the
 * flag canViewUser weighs, nothing more, since the viewer is usually not the
 * owner and the rest of the row (email included) has no business on the page. */
export async function getUserProfile(db: Database, id: string) {
  return db
    .select({ id: user.id, name: user.name, image: user.image, isPrivate: user.isPrivate })
    .from(user)
    .where(eq(user.id, id))
    .get();
}

/** Who holds a display name, if anyone — case-insensitive to match
 * user_name_unique_idx (COLLATE NOCASE, migration 0034), so the friendly
 * checks built on this agree with what the index will actually reject. */
export async function getUserIdByName(db: Database, name: string) {
  const row = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.name} = ${name} COLLATE NOCASE`)
    .get();
  return row?.id ?? null;
}

/** Lowercased set of every display name that could collide with `base` or
 * with uniqueDisplayName's "stem N" suffix candidates — one query instead of
 * a round-trip per candidate. Prefix matching uses the same ASCII folding
 * as user_name_unique_idx. */
export async function getTakenNamesAround(db: Database, base: string, stem: string) {
  const rows = await db
    .select({ name: user.name })
    .from(user)
    .where(
      sql`${user.name} = ${base} COLLATE NOCASE OR ${literalPrefixCondition(sql`${user.name}`, `${stem} `)}`,
    )
    .all();
  return new Set(rows.map((row) => row.name.toLowerCase()));
}

/** Batch lookup for the review queue — one IN query for a page's worth of
 * requester names and photos instead of one getUser round-trip per row. */
export async function getUsersByIds(db: Database, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(user)
    .where(sql`${user.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
    .all();
}

export async function getProductTourState(db: Database, id: string) {
  const [owner, progress] = await Promise.all([
    db.select({ returning: user.productTourReturning }).from(user).where(eq(user.id, id)).get(),
    db
      .select({
        tourId: userProductTours.tourId,
        version: userProductTours.version,
        status: userProductTours.status,
      })
      .from(userProductTours)
      .where(eq(userProductTours.userId, id)),
  ]);
  return owner ? { returning: owner.returning, progress } : null;
}
