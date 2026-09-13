import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb, type Database } from "@/db/client";
import { friendships, user } from "@/db/schema";
import { sendFriendRequestEmail, sendWelcomeEmail } from "@/lib/email";
import { friendshipPair } from "@/lib/friendships";
import { welcomeNewAccountOnce } from "@/lib/welcome-email";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";

/** The guard is the point of this module: verification can reach the hook
 * more than once per account (a later change-email verification goes through
 * the same path), and welcome_email_sent_at is the only thing standing between
 * that and a duplicate. */

// Reaching for getCloudflareContext outside a request. Stub the decision —
// whether an email went out — not the Resend client.
vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: vi.fn<() => Promise<void>>(async () => {}),
  sendFriendRequestEmail: vi.fn<() => Promise<void>>(async () => {}),
}));

let db: Database;

beforeAll(() => {
  db = createDb(env.DB);
});

beforeEach(() => {
  vi.mocked(sendWelcomeEmail).mockResolvedValue(undefined);
  vi.mocked(sendFriendRequestEmail).mockResolvedValue(undefined);
  vi.clearAllMocks();
});

async function stampFor(id: string) {
  const row = await db
    .select({ welcomeEmailSentAt: user.welcomeEmailSentAt })
    .from(user)
    .where(eq(user.id, id))
    .get();
  return row?.welcomeEmailSentAt ?? null;
}

describe("welcomeNewAccountOnce", () => {
  it("sends the email and stamps the account", async () => {
    const account = await seedFixtureUser(db, { id: "welcome-first", name: "Ada" });

    await welcomeNewAccountOnce(db, account);

    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith(account.email, "Ada");
    expect(sendFriendRequestEmail).not.toHaveBeenCalled();
    expect(await stampFor(account.id)).toBeInstanceOf(Date);
  });

  it("claims a welcome once when verification callbacks race", async () => {
    const account = await seedFixtureUser(db, { id: "welcome-concurrent", name: "Grace" });
    await Promise.all([
      welcomeNewAccountOnce(db, account),
      welcomeNewAccountOnce(db, account),
      welcomeNewAccountOnce(db, account),
    ]);
    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith(account.email, "Grace");
    expect(await stampFor(account.id)).toBeInstanceOf(Date);
  });

  it("sends nothing the second time — the change-email case", async () => {
    const account = await seedFixtureUser(db, { id: "welcome-twice" });

    await welcomeNewAccountOnce(db, account);
    const stamped = await stampFor(account.id);
    vi.clearAllMocks();

    await welcomeNewAccountOnce(db, account);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    // The claim is not refreshed either, so the stamp still says when the one
    // email that exists actually went out.
    expect(await stampFor(account.id)).toEqual(stamped);
  });

  it("never re-sends to an account the migration backfilled", async () => {
    const account = await seedFixtureUser(db, {
      id: "welcome-backfilled",
      emailVerified: true,
      welcomeEmailSentAt: new Date(1_700_000_000_000),
    });

    await welcomeNewAccountOnce(db, account);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("keeps the claim when Resend rejects the send", async () => {
    // Claim-then-send means a failure costs this account its welcome email
    // rather than risking a duplicate. Pinned because it's a deliberate
    // trade, not an accident: nothing here retries.
    vi.mocked(sendWelcomeEmail).mockRejectedValue(new Error("Resend is down"));
    const account = await seedFixtureUser(db, { id: "welcome-failed" });

    await expect(welcomeNewAccountOnce(db, account)).rejects.toThrow("Resend is down");

    expect(await stampFor(account.id)).toBeInstanceOf(Date);
  });

  it("welcomes an OAuth user registered with a profile image and verified email", async () => {
    const account = await seedFixtureUser(db, {
      id: "welcome-oauth",
      name: "Google Climber",
      image: "https://lh3.googleusercontent.com/a/avatar",
      emailVerified: true,
    });

    const userRow = await db.select().from(user).where(eq(user.id, account.id)).get();
    expect(userRow?.image).toBe("https://lh3.googleusercontent.com/a/avatar");

    await welcomeNewAccountOnce(db, account);

    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith(account.email, "Google Climber");
    expect(await stampFor(account.id)).toBeInstanceOf(Date);
  });
});

describe("share link friend request", () => {
  async function requestsBetween(a: string, b: string) {
    const pair = friendshipPair(a, b);
    return db
      .select({
        userId: friendships.userId,
        friendId: friendships.friendId,
        requestedBy: friendships.requestedBy,
        status: friendships.status,
      })
      .from(friendships)
      .where(and(eq(friendships.userId, pair.userId), eq(friendships.friendId, pair.friendId)));
  }

  async function invite(suffix: string, owner: { isPrivate?: boolean } = {}) {
    const inviter = await seedFixtureUser(db, {
      id: `referrer-${suffix}`,
      name: `Inviter ${suffix}`,
      isPrivate: owner.isPrivate ?? false,
    });
    const account = await seedFixtureUser(db, {
      id: `referred-${suffix}`,
      name: `Newcomer ${suffix}`,
      referredBy: inviter.id,
    });
    return { inviter, account };
  }

  it("asks the share link's owner once, however often verification repeats", async () => {
    const { inviter, account } = await invite("once");

    await Promise.all([welcomeNewAccountOnce(db, account), welcomeNewAccountOnce(db, account)]);
    await welcomeNewAccountOnce(db, account);

    expect(await requestsBetween(account.id, inviter.id)).toEqual([
      { ...friendshipPair(account.id, inviter.id), requestedBy: account.id, status: "pending" },
    ]);
    expect(sendFriendRequestEmail).toHaveBeenCalledExactlyOnceWith(inviter.email, "Newcomer once");
    expect(sendWelcomeEmail).toHaveBeenCalledOnce();
  });

  it("never repeats a request the owner declined", async () => {
    const { inviter, account } = await invite("declined");
    await welcomeNewAccountOnce(db, account);
    const pair = friendshipPair(account.id, inviter.id);
    await db.delete(friendships).where(eq(friendships.userId, pair.userId));
    expect(await requestsBetween(account.id, inviter.id)).toEqual([]);

    await welcomeNewAccountOnce(db, account);

    expect(await requestsBetween(account.id, inviter.id)).toEqual([]);
    expect(sendFriendRequestEmail).toHaveBeenCalledOnce();
  });

  it("sends no request to an owner whose profile is private at verification", async () => {
    const { inviter, account } = await invite("private", { isPrivate: true });

    await welcomeNewAccountOnce(db, account);

    expect(await requestsBetween(account.id, inviter.id)).toEqual([]);
    expect(sendFriendRequestEmail).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).toHaveBeenCalledOnce();
  });

  it.each(["pending", "accepted"] as const)(
    "leaves an existing %s pair untouched and still welcomes the account",
    async (status) => {
      const { inviter, account } = await invite(`existing-${status}`);
      await seedFixtureFriendship(db, inviter.id, account.id, status);

      await welcomeNewAccountOnce(db, account);

      expect(await requestsBetween(account.id, inviter.id)).toEqual([
        { ...friendshipPair(account.id, inviter.id), requestedBy: inviter.id, status },
      ]);
      expect(sendFriendRequestEmail).not.toHaveBeenCalled();
      expect(sendWelcomeEmail).toHaveBeenCalledOnce();
    },
  );

  it("only welcomes an account whose inviter deleted their account first", async () => {
    const { inviter, account } = await invite("deleted");
    await db.delete(user).where(eq(user.id, inviter.id));

    await welcomeNewAccountOnce(db, account);

    expect(await requestsBetween(account.id, inviter.id)).toEqual([]);
    expect(sendFriendRequestEmail).not.toHaveBeenCalled();
    expect(sendWelcomeEmail).toHaveBeenCalledOnce();
  });

  it("keeps the request when the welcome email fails", async () => {
    vi.mocked(sendWelcomeEmail).mockRejectedValue(new Error("Resend is down"));
    const { inviter, account } = await invite("email-down");

    await expect(welcomeNewAccountOnce(db, account)).rejects.toThrow("Resend is down");

    expect(await requestsBetween(account.id, inviter.id)).toHaveLength(1);
    expect(sendFriendRequestEmail).toHaveBeenCalledExactlyOnceWith(
      inviter.email,
      "Newcomer email-down",
    );
  });

  it("still welcomes the account when the friend request email fails", async () => {
    vi.mocked(sendFriendRequestEmail).mockRejectedValue(new Error("Resend is down"));
    const { inviter, account } = await invite("request-email-down");

    await expect(welcomeNewAccountOnce(db, account)).rejects.toThrow("Resend is down");

    expect(await requestsBetween(account.id, inviter.id)).toHaveLength(1);
    expect(sendWelcomeEmail).toHaveBeenCalledExactlyOnceWith(
      account.email,
      "Newcomer request-email-down",
    );
  });

  it("reports both failures when both emails fail", async () => {
    vi.mocked(sendFriendRequestEmail).mockRejectedValue(new Error("Request email down"));
    vi.mocked(sendWelcomeEmail).mockRejectedValue(new Error("Welcome email down"));
    const { account } = await invite("both-down");

    await expect(welcomeNewAccountOnce(db, account)).rejects.toMatchObject({
      message: expect.stringMatching(/Request email down.*Welcome email down/),
      errors: [new Error("Request email down"), new Error("Welcome email down")],
    });
  });
});
