import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-google-photo-registration-only",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn<() => Promise<void>>(),
  sendResetPasswordEmail: vi.fn<() => Promise<void>>(),
  sendWelcomeEmail: vi.fn<() => Promise<void>>(),
  sendFriendRequestEmail: vi.fn<() => Promise<void>>(),
}));

const db = createDb(env.DB);
const ORIGIN = "http://localhost:3000";
const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/from-the-provider=s96-c";

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb(db);
});

/** Only the external provider is replaced: state, cookies, callback handling,
 * registration hooks and D1 persistence all run through Better Auth. The
 * profile deliberately carries a photo, which is what Google really sends. */
async function googleCallback() {
  const auth = await initAuth();
  const context = await auth.$context;
  const provider = context.socialProviders.find((provider) => provider.id === "google")!;
  provider.validateAuthorizationCode = vi
    .fn<typeof provider.validateAuthorizationCode>()
    .mockResolvedValue({ accessToken: "test-token" });
  provider.getUserInfo = vi.fn<typeof provider.getUserInfo>().mockResolvedValue({
    data: {},
    user: {
      id: "google-photo",
      name: "Google Climber",
      email: "google@example.com",
      emailVerified: true,
      image: GOOGLE_PHOTO,
    },
  });

  const initiation = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/account",
        errorCallbackURL: "/sign-in",
        additionalData: { acceptedTermsVersion: TERMS_VERSION },
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
      `${ORIGIN}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: cookies } },
    ),
  );
}

it("creates a Google account with no photo, whatever the provider sends", async () => {
  const response = await googleCallback();

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/account");
  const [stored] = await db.select().from(user);
  // A photo on a climber's profile should be something they chose to put
  // there, not a side effect of which sign-in button they pressed.
  expect(stored).toMatchObject({ email: "google@example.com", image: null });
  expect(stored.name).toBe("Google Climber");
});

it("leaves an existing Google photo alone when that climber signs in again", async () => {
  await db.insert(user).values({
    id: "existing-google",
    name: "Existing Climber",
    email: "google@example.com",
    emailVerified: true,
    image: GOOGLE_PHOTO,
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date(),
  });

  const response = await googleCallback();

  expect(response.status).toBe(302);
  // Accounts that already carry a provider photo keep it: this change governs
  // account creation, and nothing migrates or clears what is already stored.
  expect((await db.select().from(user).where(eq(user.id, "existing-google")).get())?.image).toBe(
    GOOGLE_PHOTO,
  );
});
