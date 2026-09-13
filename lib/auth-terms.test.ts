import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { user, userTermsAcceptances } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { formatAuthErrorMessage } from "@/lib/sign-in-redirect";
import { TERMS_REQUIRED_MESSAGE, TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-terms-registration-only",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn<() => Promise<void>>(),
  sendResetPasswordEmail: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/lib/welcome-email", () => ({ welcomeNewAccountOnce: vi.fn<() => Promise<void>>() }));

const db = createDb(env.DB);
beforeEach(async () => resetDb(db));

function signup(acceptedTermsVersion?: unknown, extra: Record<string, unknown> = {}) {
  return new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({
      name: "Terms Climber",
      email: "terms@example.com",
      password: "password123",
      acceptedTermsVersion,
      ...extra,
    }),
  });
}

it.each([undefined, false, "old-version"])(
  "rejects email registration with consent %s without creating a user",
  async (version) => {
    const auth = await initAuth();
    const response = await auth.handler(signup(version));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("Terms of Service"),
    });
    expect(await db.select().from(user)).toEqual([]);
  },
);

it("stores the accepted version with a server timestamp", async () => {
  const auth = await initAuth();
  const before = Date.now();
  const response = await auth.handler(signup(TERMS_VERSION));
  expect(response.status).toBe(200);
  const [stored] = await db.select().from(user);
  expect(stored).toMatchObject({ email: "terms@example.com", termsVersion: TERMS_VERSION });
  expect(stored).toHaveProperty("termsAcceptedAt", expect.any(Date));
  const acceptedAt = stored.termsAcceptedAt!.getTime();
  expect(acceptedAt).toBeGreaterThanOrEqual(before);
  expect(acceptedAt).toBeLessThanOrEqual(Date.now());
  expect(await db.select().from(userTermsAcceptances)).toEqual([
    { userId: stored.id, version: TERMS_VERSION, acceptedAt: stored.termsAcceptedAt },
  ]);
});

it.each([{ termsVersion: "forged" }, { termsAcceptedAt: "2000-01-01T00:00:00.000Z" }])(
  "rejects client-written acceptance records: %s",
  async (extra) => {
    const auth = await initAuth();
    const response = await auth.handler(signup(TERMS_VERSION, extra));
    expect(response.status).toBe(400);
    expect(await db.select().from(user)).toEqual([]);
  },
);

async function googleCallback(version?: string) {
  const auth = await initAuth();
  const context = await auth.$context;
  const provider = context.socialProviders.find((provider) => provider.id === "google")!;
  // Only the external provider is replaced: state, cookies, callback handling,
  // registration hooks, and D1 persistence all run through Better Auth.
  provider.validateAuthorizationCode = vi
    .fn<typeof provider.validateAuthorizationCode>()
    .mockResolvedValue({ accessToken: "test-token" });
  provider.getUserInfo = vi.fn<typeof provider.getUserInfo>().mockResolvedValue({
    data: {},
    user: {
      id: "google-terms",
      name: "Google Climber",
      email: "google@example.com",
      emailVerified: true,
    },
  });
  const initiation = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/account",
        errorCallbackURL: "/sign-in",
        additionalData: { acceptedTermsVersion: version },
      }),
    }),
  );
  expect(initiation.status).toBe(200);
  const { url } = (await initiation.json()) as { url: string };
  const state = new URL(url).searchParams.get("state")!;
  const cookies = initiation.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  return auth.handler(
    new Request(
      `http://localhost:3000/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: cookies } },
    ),
  );
}

it.each([undefined, "old-version"])(
  "rejects Google account creation without current consent: %s",
  async (version) => {
    const response = await googleCallback(version);
    expect(response.status).toBe(302);
    const destination = new URL(response.headers.get("location")!, "http://localhost:3000");
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("error")).toBe(TERMS_REQUIRED_MESSAGE.replaceAll(" ", "_"));
    expect(formatAuthErrorMessage(destination.searchParams.get("error") ?? undefined)).toBe(
      "Please review the Terms of Service and try again to create your account.",
    );
    expect(await db.select().from(user)).toEqual([]);
  },
);

it("carries Google consent through verified OAuth state into the new account", async () => {
  const before = Date.now();
  const response = await googleCallback(TERMS_VERSION);
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/account");
  const [stored] = await db.select().from(user);
  expect(stored).toMatchObject({ email: "google@example.com", termsVersion: TERMS_VERSION });
  expect(stored.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before);
  expect(stored.termsAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now());
});

it("does not backfill acceptance for an existing Google account", async () => {
  await db.insert(user).values({
    id: "existing-google",
    name: "Existing Climber",
    email: "google@example.com",
    emailVerified: true,
  });
  const response = await googleCallback();
  expect(response.headers.get("location")).toBe("/account");
  expect(await db.select().from(user)).toMatchObject([
    { id: "existing-google", termsVersion: null, termsAcceptedAt: null },
  ]);
});

it("does not allow the built-in profile-update endpoint to bypass renewed acceptance", async () => {
  const auth = await initAuth();
  await auth.handler(signup(TERMS_VERSION));
  await db
    .update(user)
    .set({ emailVerified: true, termsVersion: "2025-01-01", termsAcceptedAt: new Date(1000) });
  const signin = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "terms@example.com", password: "password123" }),
    }),
  );
  expect(signin.status).toBe(200);
  const cookies = signin.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/update-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: cookies,
      },
      body: JSON.stringify({ name: "Changed without agreement" }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "TERMS_ACCEPTANCE_REQUIRED" });
  expect(
    (await db.select().from(user).where(eq(user.email, "terms@example.com")).get())?.name,
  ).toBe("Terms Climber");
});
