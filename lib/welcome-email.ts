import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { sendFriendRequestEmail, sendWelcomeEmail } from "@/lib/email";
import { friendshipPair } from "@/lib/friendships";

type NewAccount = { id: string; email: string; name: string };

/** What a newly verified account gets exactly once: the welcome email and,
 * when it signed up through a share link, a friend request to that link's
 * owner. */
export async function welcomeNewAccountOnce(db: Database, account: NewAccount) {
  // Claim first, send second, and let the database decide who won. Two
  // concurrent verify-email requests both reach this line; the IS NULL
  // predicate means exactly one of them gets a row back.
  const claimed = await db
    .update(user)
    .set({ welcomeEmailSentAt: new Date() })
    .where(and(eq(user.id, account.id), isNull(user.welcomeEmailSentAt)))
    .returning({ id: user.id })
    .get();

  if (!claimed) return;

  // If either step throws, the claim stays set and this account never gets
  // it. That's the deliberate direction to fail in: there is no queue, retry,
  // or dead-letter anywhere in this app to hand a rollback to, and a missing
  // welcome is a non-event while a duplicate one is a visible bug. Neither
  // step's failure may cost the other.
  const results = await Promise.allSettled([
    requestFriendshipWithReferrer(db, account),
    sendWelcomeEmail(account.email, account.name),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}

async function requestFriendshipWithReferrer(db: Database, account: NewAccount) {
  const invited = alias(user, "invited");
  const referrer = await db
    .select({ id: user.id, email: user.email })
    .from(invited)
    .innerJoin(user, eq(user.id, invited.referredBy))
    .where(eq(invited.id, account.id))
    .get();
  if (!referrer) return;

  // requestFriendship's rules: never to a private profile, never over an
  // existing pair, and only the insert winner sends email.
  const pair = friendshipPair(account.id, referrer.id);
  const inserted = await db.get(sql`
    INSERT INTO friendships (user_id, friend_id, requested_by)
    SELECT ${pair.userId}, ${pair.friendId}, ${account.id} FROM user WHERE id = ${referrer.id} AND is_private = 0
    ON CONFLICT (user_id, friend_id) DO NOTHING
    RETURNING user_id
  `);
  if (inserted) await sendFriendRequestEmail(referrer.email, account.name);
}
