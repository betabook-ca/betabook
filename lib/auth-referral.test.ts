import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { friendships, user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { sendFriendRequestEmail, sendVerificationEmail } from "@/lib/email";
import { friendshipPair } from "@/lib/friendships";
import { profileSharePath } from "@/lib/profile-share";
import { TERMS_VERSION } from "@/lib/terms";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-referral-registration-only",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn<(to: string, url: string) => Promise<void>>(),
  sendResetPasswordEmail: vi.fn<() => Promise<void>>(),
  sendWelcomeEmail: vi.fn<() => Promise<void>>(),
  sendFriendRequestEmail: vi.fn<() => Promise<void>>(),
}));

const db = createDb(env.DB);
const ORIGIN = "http://localhost:3000";
let ownerEmail: string;

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb(db);
  await db.delete(friendships);
  ownerEmail = (await seedFixtureUser(db, { id: "owner", name: "Share Owner" })).email;
});

async function ownerSharePath() {
  return profileSharePath("owner", (await getProfileShareToken(db, "owner"))!);
}

async function emailSignUp(extra: Record<string, unknown>) {
  const auth = await initAuth();
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        name: "Invited Climber",
        email: "invited@example.com",
        password: "password123",
        acceptedTermsVersion: TERMS_VERSION,
        ...extra,
      }),
    }),
  );
}

async function accountFor(email: string) {
  return db.select().from(user).where(eq(user.email, email)).get();
}

function friendRequests() {
  return db
    .select({
      userId: friendships.userId,
      friendId: friendships.friendId,
      requestedBy: friendships.requestedBy,
      status: friendships.status,
    })
    .from(friendships);
}

async function googleSignUp(additionalData: Record<string, unknown>) {
  const auth = await initAuth();
  const context = await auth.$context;
  const provider = context.socialProviders.find((provider) => provider.id === "google")!;
  // Only the external provider is replaced; state, callback handling and
  // registration hooks run through Better Auth.
  provider.validateAuthorizationCode = vi
    .fn<typeof provider.validateAuthorizationCode>()
    .mockResolvedValue({ accessToken: "test-token" });
  provider.getUserInfo = vi.fn<typeof provider.getUserInfo>().mockResolvedValue({
    data: {},
    user: {
      id: "google-invited",
      name: "Google Climber",
      email: "google@example.com",
      emailVerified: true,
    },
  });
  const initiation = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/users/owner",
        errorCallbackURL: "/sign-in",
        additionalData,
      }),
    }),
  );
  const { url } = (await initiation.json()) as { url: string };
  const cookies = initiation.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const state = new URL(url).searchParams.get("state")!;
  return auth.handler(
    new Request(
      `${ORIGIN}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: cookies } },
    ),
  );
}

it("records who invited an email sign-up through their current share link", async () => {
  const response = await emailSignUp({ sharePath: await ownerSharePath() });
  expect(response.status).toBe(200);
  expect((await accountFor("invited@example.com"))?.referredBy).toBe("owner");
});

it.each([
  ["an unknown link", async () => `/users/owner?share=${"0".repeat(32)}`],
  ["a malformed link", async () => "/users/owner?share=not-a-share-token"],
  [
    "another profile's path carrying the owner's token",
    async () => {
      await seedFixtureUser(db, { id: "other", name: "Other Climber" });
      return (await ownerSharePath()).replace("/users/owner", "/users/other");
    },
  ],
  [
    "a reset link",
    async () => {
      const path = await ownerSharePath();
      await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
      await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
      return path;
    },
  ],
  [
    "a private profile's current link",
    async () => {
      await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
      return ownerSharePath();
    },
  ],
])("creates the account without a referrer from %s", async (_label, sharePath) => {
  const response = await emailSignUp({ sharePath: await sharePath() });
  expect(response.status).toBe(200);
  expect((await accountFor("invited@example.com"))?.referredBy).toBeNull();
});

it("rejects a referrer written by the client", async () => {
  const response = await emailSignUp({ referredBy: "owner" });
  expect(response.status).toBe(400);
  expect(await accountFor("invited@example.com")).toBeUndefined();
});

it("sends the owner a friend request once the invited email is verified", async () => {
  expect((await emailSignUp({ sharePath: await ownerSharePath() })).status).toBe(200);
  const invited = (await accountFor("invited@example.com"))!;
  expect(await friendRequests()).toEqual([]);
  expect(sendFriendRequestEmail).not.toHaveBeenCalled();

  const [, verificationUrl] = vi.mocked(sendVerificationEmail).mock.lastCall!;
  const auth = await initAuth();
  await auth.handler(new Request(verificationUrl));

  expect(await friendRequests()).toEqual([
    { ...friendshipPair(invited.id, "owner"), requestedBy: invited.id, status: "pending" },
  ]);
  expect(sendFriendRequestEmail).toHaveBeenCalledExactlyOnceWith(ownerEmail, "Invited Climber");
});

it("sends no friend request for a sign-up without a share link", async () => {
  expect((await emailSignUp({})).status).toBe(200);
  const [, verificationUrl] = vi.mocked(sendVerificationEmail).mock.lastCall!;
  await (await initAuth()).handler(new Request(verificationUrl));

  expect((await accountFor("invited@example.com"))?.emailVerified).toBe(true);
  expect(await friendRequests()).toEqual([]);
  expect(sendFriendRequestEmail).not.toHaveBeenCalled();
});

it("carries the share link through Google OAuth state and asks the owner at once", async () => {
  const callback = await googleSignUp({
    acceptedTermsVersion: TERMS_VERSION,
    sharePath: await ownerSharePath(),
  });

  expect(callback.headers.get("location")).toBe("/users/owner");
  const invited = (await accountFor("google@example.com"))!;
  expect(invited.referredBy).toBe("owner");
  expect(await friendRequests()).toEqual([
    { ...friendshipPair(invited.id, "owner"), requestedBy: invited.id, status: "pending" },
  ]);
  expect(sendFriendRequestEmail).toHaveBeenCalledExactlyOnceWith(ownerEmail, "Google Climber");
});
