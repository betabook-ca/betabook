import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { getTakenNamesAround } from "@/db/queries";
import { changeRequests, sends } from "@/db/schema";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";

/** Finds a free display name starting from `base`, for account-creation
 * paths that must not fail on a collision: OAuth sign-in arrives with
 * whatever name Google supplies, and rejecting it would block the sign-in
 * itself — unlike the email form, where the user can just pick again.
 * Numeric suffixes keep the result recognizable; the random fallback exists
 * only so this terminates even if someone squats "Name 2"–"Name 99".
 * One query up front covers the base and every suffix candidate — this runs
 * inside the OAuth callback, where probing candidates one round-trip at a
 * time would stall the sign-in. `toLowerCase()` folds more than the index's
 * ASCII-only NOCASE, so at worst a candidate is skipped, never returned
 * while taken. */
export async function uniqueDisplayName(db: Database, base: string): Promise<string> {
  const trimmed = base.trim().slice(0, MAX_DISPLAY_NAME_LENGTH).trim() || "Climber";
  const stem = trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH - 3);
  const taken = await getTakenNamesAround(db, trimmed, stem);
  if (!taken.has(trimmed.toLowerCase())) return trimmed;
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${stem} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH - 9)} ${crypto.randomUUID().slice(0, 8)}`;
}

/** Explicit cleanup used by Better Auth's beforeDelete hook. Local D1
 * cascades also fire aggregate triggers; this pre-delete is retained until
 * account deletion is verified end-to-end in the deployed runtime. */
export async function deleteAccountSends(db: Database, userId: string): Promise<void> {
  await db.delete(sends).where(eq(sends.userId, userId));
}

/** Deletes the user's *pending* change requests ahead of the user row —
 * nobody is left to hear a decision on them. Decided rows deliberately
 * survive: requested_by is a set-null FK (see drizzle/schema/moderation.ts),
 * so the audit trail of applied structural changes outlives the account. */
export async function deleteAccountPendingChangeRequests(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .delete(changeRequests)
    .where(and(eq(changeRequests.requestedBy, userId), eq(changeRequests.status, "pending")));
}
