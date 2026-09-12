import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { session, user } from "@/db/schema";
import { initAuth } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-client-ip-only",
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

const credentials = { email: "ip@example.com", password: "password123" };
const jsonHeaders = { "Content-Type": "application/json", Origin: "http://localhost:3000" };

async function sessionIpAfterSignIn(clientHeaders: Record<string, string>) {
  const auth = await initAuth();
  await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        ...credentials,
        name: "Address Climber",
        acceptedTermsVersion: TERMS_VERSION,
      }),
    }),
  );
  await db.update(user).set({ emailVerified: true });
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { ...jsonHeaders, ...clientHeaders },
      body: JSON.stringify(credentials),
    }),
  );
  expect(response.status).toBe(200);
  return (await db.select().from(session).get())?.ipAddress;
}

it("identifies the client by CF-Connecting-IP when the client also sent X-Forwarded-For", async () => {
  expect(
    await sessionIpAfterSignIn({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 203.0.113.7",
    }),
  ).toBe("203.0.113.7");
});

it("does not take the client address from X-Forwarded-For", async () => {
  expect(await sessionIpAfterSignIn({ "x-forwarded-for": "198.51.100.9" })).not.toBe(
    "198.51.100.9",
  );
});
