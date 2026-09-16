import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { approveChangeRequest, requestClimbEdit } from "@/actions/moderation";
import { createDb } from "@/db/client";
import { adminAreaScopes, changeRequests, climbs } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "author", role: null as string | null }));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("@/lib/email", () => ({ sendChangeRequestDecisionEmail: async () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: identity }),
  requireAdmin: async () => ({ user: identity }),
  isAdmin: (session: { user: { role: string | null } }) => session.user.role === "admin",
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  identity.id = "author";
  identity.role = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "author" });
  await seedFixtureUser(db, { id: "reviewer", role: "admin" });
  await db.insert(adminAreaScopes).values({ userId: "reviewer", areaId: 1 });
  await db.update(climbs).set({ grade: null }).where(eq(climbs.id, 1));
});
it.each([false, true])(
  "preserves an unknown grade through a rename (direct admin: %s)",
  async (direct) => {
    if (direct) {
      identity.id = "reviewer";
      identity.role = "admin";
    }
    const form = new FormData();
    form.set("name", "Renamed ungraded climb");
    form.set("type", "boulder");
    form.set("grade", "");
    expect(await requestClimbEdit(1, form)).toEqual({
      ok: true,
      value: { status: direct ? "applied" : "pending" },
    });
    if (!direct) {
      const request = (await db.select().from(changeRequests).get())!;
      expect(JSON.parse(request.payload)).toEqual({ name: "Renamed ungraded climb" });
      expect((await db.select().from(climbs).where(eq(climbs.id, 1)).get())?.name).toBe(
        "Test Highball",
      );
      identity.id = "reviewer";
      identity.role = "admin";
      expect(await approveChangeRequest(request.id)).toMatchObject({ ok: true });
    }
    expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toMatchObject({
      name: "Renamed ungraded climb",
      grade: null,
    });
  },
);
