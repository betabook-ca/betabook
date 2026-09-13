import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { GET as areaClimbs } from "@/app/api/areas/[id]/climbs/route";
import { GET as climbSends } from "@/app/api/climbs/[id]/sends/route";
import { GET as feed } from "@/app/api/feed/route";
import { GET as companions } from "@/app/api/friends/companions/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as kayaImport } from "@/app/api/import/kaya/route";
import { GET as areas } from "@/app/api/search/areas/route";
import { GET as climbers } from "@/app/api/search/climbers/route";
import { GET as climbs } from "@/app/api/search/climbs/route";
import { GET as journal } from "@/app/api/users/[id]/journal/route";
import { GET as exportSends } from "@/app/api/users/[id]/sends/export/route";
import { GET as sends } from "@/app/api/users/[id]/sends/route";
import { createDb } from "@/db/client";
import { session } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const context = vi.hoisted(() => ({
  cookie: "",
  secret: "test-only-betabook-session-signing-secret-123456789",
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: context.cookie }) }));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("cloudflare:test");
  return {
    getCloudflareContext: async () => ({
      env: { ...env, BETTER_AUTH_SECRET: context.secret, BETTER_AUTH_URL: "http://localhost:3000" },
    }),
  };
});
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
// Exercise Better Auth's real cookie validation and migrated session storage.
async function signedCookie(token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(context.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return `better-auth.session_token=${encodeURIComponent(`${token}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`)}`;
}
beforeEach(async () => {
  context.cookie = "";
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "reader" });
  const now = Date.now();
  await db.insert(session).values([
    {
      id: "active",
      token: "active-token",
      userId: "reader",
      expiresAt: new Date(now + 60_000),
      updatedAt: new Date(now),
    },
    {
      id: "expired",
      token: "expired-token",
      userId: "reader",
      expiresAt: new Date(now - 60_000),
      updatedAt: new Date(now),
    },
  ]);
});
it.each(["missing", "forged", "unknown", "expired"])(
  "rejects a %s session across every protected API",
  async (state) => {
    context.cookie =
      state === "missing"
        ? ""
        : state === "forged"
          ? "better-auth.session_token=active-token.invalid-signature"
          : await signedCookie(`${state}-token`);
    for (const handler of Object.values({
      areaClimbs,
      climbSends,
      feed,
      companions,
      friends,
      areas,
      climbers,
      climbs,
      journal,
      sends,
      exportSends,
      kayaImport,
    })) {
      const response = await handler(
        new Request("http://localhost:3000/api/test?limit=5&offset=invalid&page=invalid"),
        { params: Promise.resolve({ id: "missing" }) },
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Not signed in" });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  },
);
it("accepts the same signed-cookie format with a live session and returns member data", async () => {
  context.cookie = await signedCookie("active-token");
  const response = await climbs(
    new Request("http://localhost:3000/api/search/climbs?name=Highball&limit=5"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    climbs: [{ id: 1, name: "Test Highball", grade: 5 }],
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
