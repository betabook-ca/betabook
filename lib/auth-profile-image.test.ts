import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { account, user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-profile-image-updates-only",
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
const PASSWORD = "correct-horse-battery";
const THEIR_PHOTO = "/api/avatars/victim/abababababababababababababababab.webp";

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb(db);
});

/** A verified account with a password, then a real sign-in: the endpoint
 * under test is session-gated, so the cookie has to be genuine. */
async function signIn() {
  const auth = await initAuth();
  const context = await auth.$context;
  await db.insert(user).values({
    id: "climber",
    name: "Signed In Climber",
    email: "climber@example.com",
    emailVerified: true,
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date(),
  });
  await db.insert(account).values({
    id: "climber-credential",
    userId: "climber",
    accountId: "climber",
    providerId: "credential",
    password: await context.password.hash(PASSWORD),
  });

  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ email: "climber@example.com", password: PASSWORD }),
    }),
  );
  expect(response.status).toBe(200);
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  expect(cookies).toContain("session_token");
  return { auth, cookies };
}

async function storedImage() {
  return (await db.select({ image: user.image }).from(user).where(eq(user.id, "climber")).get())
    ?.image;
}

it("refuses a client-supplied profile photo on /update-user", async () => {
  const { auth, cookies } = await signIn();

  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/update-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookies },
      body: JSON.stringify({ image: THEIR_PHOTO }),
    }),
  );

  // `user.image` is read back as the key of an object to serve and to delete,
  // so a caller who could set it freely could name another climber's photo
  // and have their own upload or removal delete it.
  expect(await storedImage()).toBeNull();
  expect(response.status).toBeLessThan(500);
});

it("still accepts a display name change on the same endpoint", async () => {
  const { auth, cookies } = await signIn();

  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/update-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookies },
      body: JSON.stringify({ name: "Renamed Climber", image: THEIR_PHOTO }),
    }),
  );

  expect(response.status).toBe(200);
  const stored = await db.select().from(user).where(eq(user.id, "climber")).get();
  expect(stored?.name).toBe("Renamed Climber");
  expect(stored?.image).toBeNull();
});
