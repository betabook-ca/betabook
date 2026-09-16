import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { initAuth } from "@/lib/auth";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const mail = vi.hoisted(() => ({
  send: vi.fn<() => Promise<{ error: { message: string } }>>(async () => ({
    error: { message: "Delivery rejected" },
  })),
}));
vi.mock("resend", () => ({
  Resend: class {
    public emails = { send: mail.send };
  },
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: env.DB,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-for-auth-email-failures-only",
      RESEND_API_KEY: "rejected-key",
    },
  }),
}));
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "reader", email: "reader@example.com", emailVerified: false });
  mail.send.mockClear();
});

it.each(["request-password-reset", "send-verification-email"])(
  "logs failed %s deliveries without exposing whether the address exists",
  async (endpoint) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const auth = await initAuth();
      const request = (email: string) =>
        auth.handler(
          new Request(`http://localhost:3000/api/auth/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
            body: JSON.stringify({ email, redirectTo: "/reset-password", callbackURL: "/sign-in" }),
          }),
        );
      const known = await request("reader@example.com");
      const unknown = await request("unknown@example.com");
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      expect(mail.send).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("Authentication email delivery failed", expect.any(Error));
    } finally {
      log.mockRestore();
    }
  },
);
