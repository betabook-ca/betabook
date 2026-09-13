import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { setUserPrivate } from "@/actions/account";
import { acceptTerms } from "@/actions/terms";
import { createDb } from "@/db/client";
import { user, userTermsAcceptances } from "@/db/schema";
import { withApiSession } from "@/lib/api-session";
import { requireSession } from "@/lib/session";
import { getMemberSession } from "@/lib/session";
import { TERMS_VERSION } from "@/lib/terms";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "legacy" as string | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
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
  identity.id = "legacy";
  await resetDb(db);
  await db
    .insert(user)
    .values({ id: "legacy", name: "Legacy Climber", email: "legacy@example.com" });
});

it.each([null, "2025-01-01"])(
  "blocks an existing session with stored version %s despite a current cached user",
  async (version) => {
    await db
      .update(user)
      .set({ termsVersion: version, termsAcceptedAt: version ? new Date(1000) : null });
    await expect(requireSession()).rejects.toThrow("Terms of Service");
  },
);

it("denies member APIs before their handler runs", async () => {
  const handler = vi.fn<() => Promise<Response>>(async () =>
    Response.json({ secret: "member data" }),
  );
  const response = await withApiSession(handler)();
  expect(response.status).toBe(428);
  expect(await response.json()).toMatchObject({ code: "TERMS_ACCEPTANCE_REQUIRED" });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(handler).not.toHaveBeenCalled();
});

it("denies a real account mutation without changing stored data", async () => {
  const result = await setUserPrivate(true);
  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Terms of Service") });
  expect((await db.select().from(user).where(eq(user.id, "legacy")).get())?.isPrivate).toBe(false);
});

it("allows member access only with both the current version and a timestamp", async () => {
  await db.update(user).set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() });
  await expect(requireSession()).resolves.toMatchObject({ user: { id: "legacy" } });
  expect((await withApiSession(async () => Response.json({ ok: true }))()).status).toBe(200);
});

it("keeps member page loaders anonymous until acceptance", async () => {
  expect(await getMemberSession()).toBeNull();
  await acceptTerms(TERMS_VERSION, true);
  expect(await getMemberSession()).toMatchObject({ user: { id: "legacy" } });
});

it.each([
  [TERMS_VERSION, false],
  [TERMS_VERSION, "true"],
  ["old", true],
  [null, true],
])("rejects invalid agreement %s / %s without changing either record", async (version, agreed) => {
  expect(await acceptTerms(version, agreed)).toMatchObject({ ok: false });
  expect(await db.select().from(userTermsAcceptances)).toEqual([]);
  expect((await db.select().from(user).get())?.termsVersion).toBeNull();
});

it("preserves previous versions and timestamps while accepting once for the signed-in account", async () => {
  await db.insert(user).values({ id: "other", name: "Other Climber", email: "other@example.com" });
  await db
    .update(user)
    .set({ termsVersion: "2025-01-01", termsAcceptedAt: new Date(1000) })
    .where(eq(user.id, "legacy"));
  const before = Date.now();
  expect(await acceptTerms(TERMS_VERSION, true)).toEqual({ ok: true, value: undefined });
  const stored = await db.select().from(user).where(eq(user.id, "legacy")).get();
  expect(stored?.termsAcceptedAt?.getTime()).toBeGreaterThanOrEqual(before);
  expect(stored?.termsAcceptedAt?.getTime()).toBeLessThanOrEqual(Date.now());
  const history = await db
    .select()
    .from(userTermsAcceptances)
    .orderBy(userTermsAcceptances.version);
  expect(history).toEqual([
    { userId: "legacy", version: "2025-01-01", acceptedAt: new Date(1000) },
    { userId: "legacy", version: TERMS_VERSION, acceptedAt: stored!.termsAcceptedAt },
  ]);
  await Promise.all([acceptTerms(TERMS_VERSION, true), acceptTerms(TERMS_VERSION, true)]);
  expect(
    await db.select().from(userTermsAcceptances).orderBy(userTermsAcceptances.version),
  ).toEqual(history);
  expect(
    (await db.select().from(user).where(eq(user.id, "legacy")).get())?.termsAcceptedAt,
  ).toEqual(stored?.termsAcceptedAt);
  expect((await db.select().from(user).where(eq(user.id, "other")).get())?.termsVersion).toBeNull();
  await expect(db.update(userTermsAcceptances).set({ acceptedAt: new Date() })).rejects.toThrow(
    "Failed query",
  );
});

it("requires authentication to accept", async () => {
  identity.id = null;
  expect(await acceptTerms(TERMS_VERSION, true)).toMatchObject({ ok: false });
  expect(await db.select().from(userTermsAcceptances)).toEqual([]);
});

it("rejects current-version records with no timestamp", async () => {
  await db.update(user).set({ termsVersion: TERMS_VERSION, termsAcceptedAt: null });
  await expect(requireSession()).rejects.toThrow("Terms of Service");
});
