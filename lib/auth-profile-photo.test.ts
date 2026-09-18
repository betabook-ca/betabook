import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

/** The Show photo choice is the climber's, so an OAuth sign-in must not
 * silently undo it. Better Auth owns the write that lands on `user` when a
 * Google sign-in completes, and `show_profile_photo` has no place in a Google
 * profile — this drives the real callback so a Better Auth upgrade that starts
 * writing whole user rows fails here instead of in production. */

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-profile-photo-only",
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
const EMAIL = "google-photo@example.com";
const FIRST_PHOTO = "https://lh3.googleusercontent.com/a/first=s96-c";
const SECOND_PHOTO = "https://lh3.googleusercontent.com/a/second=s96-c";

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb(db);
});

/** Replaces only the external provider, so Better Auth's own state handling,
 * callback and account linking still run. Mirrors lib/auth-referral.test.ts. */
async function googleSignIn(image: string, additionalData?: Record<string, unknown>) {
  const auth = await initAuth();
  const context = await auth.$context;
  const provider = context.socialProviders.find((candidate) => candidate.id === "google")!;
  provider.validateAuthorizationCode = vi
    .fn<typeof provider.validateAuthorizationCode>()
    .mockResolvedValue({ accessToken: "test-token" });
  provider.getUserInfo = vi.fn<typeof provider.getUserInfo>().mockResolvedValue({
    data: {},
    user: {
      id: "google-photo-user",
      name: "Google Climber",
      email: EMAIL,
      emailVerified: true,
      image,
    },
  });

  const initiation = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        provider: "google",
        callbackURL: "/feed",
        errorCallbackURL: "/sign-in",
        ...(additionalData ? { additionalData } : {}),
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

function account() {
  return db
    .select({ image: user.image, showProfilePhoto: user.showProfilePhoto, name: user.name })
    .from(user)
    .where(eq(user.email, EMAIL))
    .get();
}

it("keeps a hidden photo hidden across repeated Google sign-ins", async () => {
  await googleSignIn(FIRST_PHOTO, { acceptedTermsVersion: TERMS_VERSION });
  // Establish the starting point: a Google account arrives showing its photo.
  expect(await account()).toMatchObject({ image: FIRST_PHOTO, showProfilePhoto: true });

  await db.update(user).set({ showProfilePhoto: false }).where(eq(user.email, EMAIL));

  // Signing in again is the whole point: the choice is the climber's, and
  // nothing in a Google profile should be able to reverse it.
  await googleSignIn(FIRST_PHOTO);
  expect((await account())?.showProfilePhoto).toBe(false);

  // Including when Google reports a different photo than the stored one, which
  // is the case that would tempt a profile-sync write.
  await googleSignIn(SECOND_PHOTO);
  expect((await account())?.showProfilePhoto).toBe(false);
});

it("leaves a shown photo shown across repeated Google sign-ins", async () => {
  await googleSignIn(FIRST_PHOTO, { acceptedTermsVersion: TERMS_VERSION });
  await googleSignIn(FIRST_PHOTO);

  expect(await account()).toMatchObject({ showProfilePhoto: true, image: FIRST_PHOTO });
});

it("keeps a display name the climber chose in Betabook", async () => {
  await googleSignIn(FIRST_PHOTO, { acceptedTermsVersion: TERMS_VERSION });
  await db.update(user).set({ name: "Renamed Climber" }).where(eq(user.email, EMAIL));

  // Renaming is a Betabook feature (actions/account.ts) and display names are
  // unique, so letting Google's name win on re-entry would both undo the rename
  // and risk colliding with somebody else's name mid-sign-in.
  await googleSignIn(SECOND_PHOTO);
  const row = await account();
  expect(row?.name).toBe("Renamed Climber");
  // The photo still refreshed: dropping the provider name must not cost the
  // rest of the profile sync.
  expect(row?.image).toBe(SECOND_PHOTO);
});

it("signs a returning climber in when Google still reports their stored name", async () => {
  await googleSignIn(FIRST_PHOTO, { acceptedTermsVersion: TERMS_VERSION });

  // The display-name uniqueness guard runs on every Better Auth user write,
  // and an OAuth callback carries no session to exempt the caller from it, so
  // an unchanged name would otherwise read as another climber's and throw.
  const response = await googleSignIn(SECOND_PHOTO);
  expect(response.headers.get("location") ?? "").not.toContain("error");

  const row = await account();
  expect(row?.name).toBe("Google Climber");
  expect(row?.image).toBe(SECOND_PHOTO);
});

it("refreshes the stored photo when Google reports a new one", async () => {
  await googleSignIn(FIRST_PHOTO, { acceptedTermsVersion: TERMS_VERSION });
  expect((await account())?.image).toBe(FIRST_PHOTO);

  // Google rotates these URLs when someone changes their picture. A stale URL
  // eventually 404s and UserAvatar falls back to initials, so re-entry has to
  // pick the new one up.
  await googleSignIn(SECOND_PHOTO);
  expect((await account())?.image).toBe(SECOND_PHOTO);
});
