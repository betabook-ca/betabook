import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { session, user } from "@/db/schema";
import { getTurnstileSiteKey, initAuth } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

const turnstileEnv = vi.hoisted(() => ({
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA" as string | undefined,
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" as string | undefined,
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-captcha-only",
      ...turnstileEnv,
    },
  }),
}));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn<() => Promise<void>>(),
  sendResetPasswordEmail: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/lib/welcome-email", () => ({ sendWelcomeEmailOnce: vi.fn<() => Promise<void>>() }));

const db = createDb(env.DB);
beforeEach(async () => resetDb(db));

const credentials = { email: "captcha@example.com", password: "password123" };

it.each([
  [
    "/sign-up/email",
    { ...credentials, name: "Captcha Climber", acceptedTermsVersion: TERMS_VERSION },
  ],
  ["/sign-in/email", credentials],
  ["/request-password-reset", { email: credentials.email, redirectTo: "/reset-password" }],
])("rejects %s without a Turnstile token", async (path, body) => {
  const auth = await initAuth();
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "MISSING_RESPONSE" });
  expect(await db.select().from(user)).toEqual([]);
  expect(await db.select().from(session)).toEqual([]);
});

it("exposes the site key only when the secret is configured", async () => {
  expect(await getTurnstileSiteKey()).toBe("1x00000000000000000000AA");
  const secret = turnstileEnv.TURNSTILE_SECRET_KEY;
  turnstileEnv.TURNSTILE_SECRET_KEY = undefined;
  try {
    expect(await getTurnstileSiteKey()).toBeNull();
  } finally {
    turnstileEnv.TURNSTILE_SECRET_KEY = secret;
  }
});
