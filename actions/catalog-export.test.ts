import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { generateCatalogExport } from "@/actions/catalog-export";
import { createDb } from "@/db/client";
import { NOT_ADMIN_MESSAGE } from "@/lib/action-result";
import { CATALOG_EXPORT_KEY, getCatalogExportInfo } from "@/lib/catalog-export";
import { seedFixtureTree } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({ role: null as string | null, refreshed: 0 }));
vi.mock("next/cache", () => ({
  refresh: () => {
    state.refreshed += 1;
  },
}));
vi.mock("@/lib/session", async () => {
  const { NotAdminError } = await import("@/lib/action-result");
  return {
    requireAdmin: async () => {
      if (state.role !== "admin") throw new NotAdminError();
      return { user: { id: "reviewer", role: state.role } };
    },
  };
});
// The action reads bindings through OpenNext's request context; hand it the
// pool's real Miniflare bindings instead.
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("cloudflare:test");
  return { getCloudflareContext: async () => ({ env }) };
});

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await env.CATALOG_EXPORTS.delete(CATALOG_EXPORT_KEY);
  await seedFixtureTree(db);
  state.role = null;
  state.refreshed = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

it("refuses non-admins without writing anything", async () => {
  state.role = "member";
  expect(await generateCatalogExport()).toEqual({ ok: false, error: NOT_ADMIN_MESSAGE });
  expect(await env.CATALOG_EXPORTS.head(CATALOG_EXPORT_KEY)).toBeNull();
  expect(state.refreshed).toBe(0);
});

it("writes the snapshot for admins and refreshes the page", async () => {
  state.role = "admin";
  const result = await generateCatalogExport();
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toMatchObject({ areaCount: 5, climbCount: 4 });
  expect(await getCatalogExportInfo(env.CATALOG_EXPORTS)).toMatchObject({
    areaCount: 5,
    climbCount: 4,
    generatedAt: result.value.generatedAt,
  });
  expect(state.refreshed).toBe(1);
});
