import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { GET as areaClimbs } from "@/app/api/areas/[id]/climbs/route";
import { GET as climbSends } from "@/app/api/climbs/[id]/sends/route";
import { GET as feed } from "@/app/api/feed/route";
import { GET as companions } from "@/app/api/friends/companions/route";
import { GET as friends } from "@/app/api/friends/route";
import { GET as areas } from "@/app/api/search/areas/route";
import { GET as climbers } from "@/app/api/search/climbers/route";
import { GET as climbs } from "@/app/api/search/climbs/route";
import { GET as journal } from "@/app/api/users/[id]/journal/route";
import { GET as exportSends } from "@/app/api/users/[id]/sends/export/route";
import { GET as sends } from "@/app/api/users/[id]/sends/route";
import { createDb } from "@/db/client";
import { withApiSession } from "@/lib/api-session";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (identity.id ? { user: { id: identity.id } } : null),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);
beforeEach(async () => {
  identity.id = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "reader" });
});

const routes = {
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
};
it.each(Object.entries(routes))(
  "%s requires a session before resource and parameter checks",
  async (_name, handler) => {
    for (const id of ["1", "missing", "invalid"]) {
      for (const query of ["", "?limit=5&name=Test", "?offset=invalid&page=invalid&cursor=bad"]) {
        const response = await handler(new Request(`https://betabook.ca/api/test${query}`), {
          params: Promise.resolve({ id }),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "Not signed in" });
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    }
  },
);

it("preserves authenticated resource errors with private caching", async () => {
  identity.id = "reader";
  const response = await climbSends(new Request("https://betabook.ca/api/climbs/missing/sends"), {
    params: Promise.resolve({ id: "missing" }),
  });
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const forbidden = await exportSends(
    new Request("https://betabook.ca/api/users/other/sends/export"),
    { params: Promise.resolve({ id: "other" }) },
  );
  expect(forbidden.status).toBe(403);
  expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
});

it("keeps unexpected API failures private and omits internal error details", async () => {
  identity.id = "reader";
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failingRoute = withApiSession(async () => {
      throw new Error("Restricted internal failure detail");
    });
    const response = await failingRoute();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Internal server error" });
  } finally {
    log.mockRestore();
  }
});
