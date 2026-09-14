import { env } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { buildCatalogExport, CATALOG_EXPORT_KEY, writeCatalogExport } from "@/lib/catalog-export";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { GET } from "./route";

const identity = vi.hoisted(() => ({ id: "member" as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (identity.id ? { user: { id: identity.id } } : null),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
// Only the request-context accessor is replaced; the R2 bucket is Miniflare's.
vi.mock("@/lib/catalog-export", async (original) => {
  const actual = await original<typeof import("@/lib/catalog-export")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getCatalogExportBucket: async () => env.CATALOG_EXPORTS };
});

const db = createDb(env.DB);
const NOW = new Date("2026-09-14T06:00:00.000Z");
const request = () => new Request("https://example.test/api/catalog/export");

beforeEach(async () => {
  await resetDb(db);
  await env.CATALOG_EXPORTS.delete(CATALOG_EXPORT_KEY);
  identity.id = "member";
  await seedFixtureUser(db, { id: "member" });
  await seedFixtureTree(db);
});

it("requires sign-in", async () => {
  identity.id = null;
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("is 404 until the first snapshot exists", async () => {
  const response = await GET(request());
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "No catalog export yet" });
});

it("streams the snapshot as a dated JSON attachment", async () => {
  await writeCatalogExport(env.CATALOG_EXPORTS, await buildCatalogExport(db, NOW));
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("Content-Disposition")).toBe(
    'attachment; filename="betabook-catalog-2026-09-14.json"',
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const body = (await response.json()) as { areas: unknown[]; climbs: Record<string, unknown>[] };
  expect(response.headers.get("Content-Length")).toBe(String(JSON.stringify(body).length));
  expect(body.areas).toHaveLength(5);
  expect(body.climbs).toHaveLength(4);
  expect(body.climbs[0]).not.toHaveProperty("sendCount");
});
