import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { GET } from "@/app/api/terms/status/route";
import { createDb } from "@/db/client";
import { TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

// The cached Better Auth user always claims the current terms, so `required`
// can only be right if the route reads the stored acceptance from D1.
const identity = vi.hoisted(() => ({ id: "member" as string | null }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(identity.id ? { cookie: "better-auth.session_token=test-token" } : {}),
}));
vi.mock("@/lib/auth", () => ({
  initAuth: async () => ({
    api: {
      getSession: async () =>
        identity.id
          ? {
              user: { id: identity.id, termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
            }
          : null,
    },
  }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);

beforeEach(async () => {
  identity.id = "member";
  await resetDb(db);
});

async function status() {
  const response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  return response.json();
}

it("reports nothing to accept for a signed-out caller", async () => {
  identity.id = null;
  expect(await status()).toEqual({
    userId: null,
    required: false,
    version: TERMS_VERSION,
    versionLabel: TERMS_UPDATED_LABEL,
    previousVersion: null,
  });
});

it.each([
  ["a legacy version", "2025-01-01", new Date(1000)],
  ["no recorded version", null, null],
  ["the current version but no timestamp", TERMS_VERSION, null],
])("requires acceptance from a member with %s", async (_case, termsVersion, termsAcceptedAt) => {
  await seedFixtureUser(db, { id: "member", termsVersion, termsAcceptedAt });
  expect(await status()).toEqual({
    userId: "member",
    required: true,
    version: TERMS_VERSION,
    versionLabel: TERMS_UPDATED_LABEL,
    previousVersion: termsVersion,
  });
});

it("stops requiring acceptance once the current version is on record", async () => {
  await seedFixtureUser(db, { id: "member" });
  expect(await status()).toEqual({
    userId: "member",
    required: false,
    version: TERMS_VERSION,
    versionLabel: TERMS_UPDATED_LABEL,
    previousVersion: TERMS_VERSION,
  });
});
