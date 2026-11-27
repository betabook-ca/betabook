import { and, eq, isNull, ne, or } from "drizzle-orm";

import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { TERMS_VERSION } from "@/lib/terms";

export function getTermsAcceptance(db: Database, userId: string) {
  return db
    .select({ termsVersion: user.termsVersion, termsAcceptedAt: user.termsAcceptedAt })
    .from(user)
    .where(eq(user.id, userId))
    .get();
}

/** The conditional write preserves the first timestamp on duplicate/concurrent submissions.
 * Database triggers atomically append the matching immutable history record. */
export async function recordTermsAcceptance(db: Database, userId: string) {
  await db
    .update(user)
    .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() })
    .where(
      and(
        eq(user.id, userId),
        or(
          isNull(user.termsVersion),
          ne(user.termsVersion, TERMS_VERSION),
          isNull(user.termsAcceptedAt),
        ),
      ),
    );
  return getTermsAcceptance(db, userId);
}
