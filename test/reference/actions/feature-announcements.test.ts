import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { dismissFeatureAnnouncement } from "@/actions";
import { createDb } from "@/db/client";
import { getDismissedFeatureAnnouncementIds } from "@/db/queries";
import { user, featureAnnouncementDismissals } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "tour-owner" as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn<typeof revalidatePath>() }));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);

beforeAll(async () => {
  await seedFixtureUser(db, { id: "tour-owner" });
  await seedFixtureUser(db, { id: "tour-other" });
});
beforeEach(async () => {
  sessionState.userId = "tour-owner";
  vi.mocked(revalidatePath).mockClear();
  await db.delete(featureAnnouncementDismissals);
});
describe("feature announcement dismissals", () => {
  it("refreshes only the signed-in viewer's Analytics page for Customize", async () => {
    sessionState.userId = "tour-other";
    expect((await dismissFeatureAnnouncement("analytics-customize")).ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/users/tour-other/analytics");
  });
  it("persists per account and feature, with idempotent writes", async () => {
    expect(
      await getDismissedFeatureAnnouncementIds(db, "tour-owner", ["analytics-customize"]),
    ).toEqual([]);
    expect((await dismissFeatureAnnouncement("analytics-customize")).ok).toBe(true);
    expect((await dismissFeatureAnnouncement("analytics-customize")).ok).toBe(true);
    expect(
      await getDismissedFeatureAnnouncementIds(db, "tour-owner", ["analytics-customize"]),
    ).toEqual(["analytics-customize"]);
    expect(
      await getDismissedFeatureAnnouncementIds(db, "tour-other", ["analytics-customize"]),
    ).toEqual([]);
    expect(await getDismissedFeatureAnnouncementIds(db, "tour-owner", ["another-feature"])).toEqual(
      [],
    );
    expect(await db.select().from(featureAnnouncementDismissals)).toEqual([
      { userId: "tour-owner", featureId: "analytics-customize" },
    ]);
    await db.delete(user).where(eq(user.id, "tour-owner"));
    expect(await db.select().from(featureAnnouncementDismissals)).toEqual([]);
    await seedFixtureUser(db, { id: "tour-owner" });
  });
  it("requires authentication and validates IDs without writes", async () => {
    sessionState.userId = null;
    expect(await dismissFeatureAnnouncement("analytics-customize")).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    });
    sessionState.userId = "tour-owner";
    for (const id of ["", "unknown-feature", "bad id", "x".repeat(101)])
      expect((await dismissFeatureAnnouncement(id)).ok).toBe(false);
    expect(await db.select().from(featureAnnouncementDismissals)).toEqual([]);
  });
});
