import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { initAuth } from "@/lib/auth";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const mail = vi.hoisted(() => ({
  apiKey: "rejected-key",
  baseUrl: "https://preview.betabook.ca",
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
      BETTER_AUTH_URL: mail.baseUrl,
      BETTER_AUTH_SECRET: "test-secret-for-auth-email-failures-only",
      RESEND_API_KEY: mail.apiKey,
    },
  }),
}));
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "reader", email: "reader@example.com", emailVerified: false });
  mail.send.mockClear();
  mail.apiKey = "rejected-key";
});

it.each(
  ["request-password-reset", "send-verification-email"].flatMap((endpoint) =>
    ["rejected-key", ""].map((apiKey) => ({ endpoint, apiKey })),
  ),
)(
  "keeps $endpoint responses indistinguishable when the email key is '$apiKey'",
  async ({ endpoint, apiKey }) => {
    mail.apiKey = apiKey;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const preview = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const auth = await initAuth();
      const request = (email: string) =>
        auth.handler(
          new Request(`${mail.baseUrl}/api/auth/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: mail.baseUrl },
            body: JSON.stringify({ email, redirectTo: "/reset-password", callbackURL: "/sign-in" }),
          }),
        );
      const known = await request("reader@example.com");
      const unknown = await request("unknown@example.com");
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      expect(mail.send).toHaveBeenCalledTimes(apiKey ? 1 : 0);
      expect(preview).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("Authentication email delivery failed", expect.any(Error));
      if (!apiKey) {
        expect(log).toHaveBeenCalledWith(
          "Authentication email delivery failed",
          new Error("Email delivery is not configured"),
        );
      }
    } finally {
      log.mockRestore();
      preview.mockRestore();
    }
  },
);
