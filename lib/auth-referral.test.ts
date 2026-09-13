import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
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
  sendVerificationEmail: vi.fn<() => Promise<void>>(),
  sendResetPasswordEmail: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/lib/welcome-email", () => ({ sendWelcomeEmailOnce: vi.fn<() => Promise<void>>() }));

const db = createDb(env.DB);
const ORIGIN = "http://localhost:3000";

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
});

function ownerToken() {
  return getProfileShareToken(db, "owner") as Promise<string>;
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

async function referrerOf(email: string) {
  const row = await db
    .select({ referredBy: user.referredBy })
    .from(user)
    .where(eq(user.email, email))
    .get();
  return row?.referredBy;
}

it("records who invited an email sign-up through their current share link", async () => {
  const response = await emailSignUp({ shareToken: await ownerToken() });
  expect(response.status).toBe(200);
  expect(await referrerOf("invited@example.com")).toBe("owner");
});

it.each([
  ["an unknown link", async () => "0".repeat(32)],
  ["a malformed link", async () => "not-a-share-token"],
  [
    "a reset link",
    async () => {
      const token = await ownerToken();
      await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
      await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
      return token;
    },
  ],
  [
    "a private profile's current link",
    async () => {
      await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
      return ownerToken();
    },
  ],
])("creates the account without a referrer from %s", async (_label, shareToken) => {
  const response = await emailSignUp({ shareToken: await shareToken() });
  expect(response.status).toBe(200);
  expect(await referrerOf("invited@example.com")).toBeNull();
});

it("rejects a referrer written by the client", async () => {
  const response = await emailSignUp({ referredBy: "owner" });
  expect(response.status).toBe(400);
  expect(await db.select().from(user).where(eq(user.email, "invited@example.com"))).toEqual([]);
});

it("carries the share link through Google OAuth state", async () => {
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
        additionalData: { acceptedTermsVersion: TERMS_VERSION, shareToken: await ownerToken() },
      }),
    }),
  );
  const { url } = (await initiation.json()) as { url: string };
  const cookies = initiation.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const state = new URL(url).searchParams.get("state")!;
  const callback = await auth.handler(
    new Request(
      `${ORIGIN}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: cookies } },
    ),
  );
  expect(callback.headers.get("location")).toBe("/users/owner");
  expect(await referrerOf("google@example.com")).toBe("owner");
});
