import { env } from "cloudflare:test";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import AreaPage, { generateMetadata as areaMetadata } from "@/app/areas/[id]/[[...slug]]/page";
import { PublicAreaPage } from "@/app/areas/[id]/[[...slug]]/public-area-page";
import ClimbPage, { generateMetadata as climbMetadata } from "@/app/climbs/[id]/[[...slug]]/page";
import UserPage, { generateMetadata as userMetadata } from "@/app/users/[id]/page";
import { createDb } from "@/db/client";
import { getPublicArea } from "@/db/queries/public-catalog";
import { climbs } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("@/lib/session", () => ({ getMemberSession: async () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/users/hidden",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await db.update(climbs).set({ description: "Public route description sentinel" });
  await seedFixtureUser(db, { id: "hidden", name: "Restricted identity sentinel" });
});
const areaProps = {
  params: Promise.resolve({ id: "1", slug: ["test-crag"] }),
  searchParams: Promise.resolve({}),
};
const climbProps = {
  params: Promise.resolve({ id: "1", slug: ["test-highball"] }),
  searchParams: Promise.resolve({}),
};
it("renders public area descriptions and route grades without member statistics in props", async () => {
  const page = await AreaPage(areaProps);
  expect(page.type).toBe(PublicAreaPage);
  const area = await getPublicArea(db, 1);
  expect(area).toEqual({ id: 1, name: "Test Crag", parentId: null, description: "A test crag." });
  const content = await PublicAreaPage({ area: area!, search: {} });
  const serialized = JSON.stringify(content);
  expect(serialized).toContain("Test Highball");
  expect(serialized).toContain("Test Boulders");
  expect(serialized).toContain("A test crag.");
  expect(serialized).toContain('"grade":5');
  expect(serialized).toContain('"type":"boulder"');
  expect(serialized).not.toContain('"sendStats":');
  expect(serialized).not.toContain('"histogram":');
});
it("renders public route details and anonymized sends in the page and metadata", async () => {
  await seedFixtureUser(db, {
    id: "open",
    name: "Everyone climber sentinel",
    sendCommentVisibility: "everyone",
  });
  await seedFixtureSend(db, {
    userId: "hidden",
    climbId: 1,
    dateSent: "2026-08-14",
    comment: "Members beta sentinel",
  });
  await seedFixtureSend(db, {
    userId: "open",
    climbId: 1,
    dateSent: "2026-09-03",
    comment: "Everyone beta sentinel",
  });
  await seedFixtureUser(db, {
    id: "private",
    name: "Private climber sentinel",
    isPrivate: true,
    sendCommentVisibility: "everyone",
  });
  await seedFixtureSend(db, {
    userId: "private",
    climbId: 1,
    dateSent: "2026-07-21",
    comment: "Private beta sentinel",
  });
  const page = await ClimbPage(climbProps);
  const serialized = JSON.stringify(page);
  expect(serialized).toContain("Test Highball");
  expect(serialized).toContain("Public route description sentinel");
  expect(serialized).toContain('"type":"boulder"');
  const restricted = [
    "Restricted identity sentinel",
    "Members beta sentinel",
    "2026-08-14",
    "Private climber sentinel",
    "Private beta sentinel",
    "2026-07-21",
  ];
  for (const value of restricted) expect(serialized).not.toContain(value);
  expect(serialized).not.toContain('"userId"');
  expect(serialized).toContain('"dateSent":"2026-07"');
  const html = renderToStaticMarkup(page);
  expect(html).toContain("Everyone climber sentinel");
  expect(html).toContain("Everyone beta sentinel");
  expect(html).toContain("Sep 3, 2026");
  expect(html).toContain("Betabook climber");
  expect(html).toContain("Aug 2026");
  expect(html).not.toContain("Restricted identity sentinel");
  expect(html).not.toContain("Members beta sentinel");
  expect(html).toContain("Sign in or sign up to see all the content.");
  expect(html).toContain("V4");
  expect(html).toContain("Boulder");
  expect(html).toContain("Public route description sentinel");
  expect(html).not.toContain("this climb’s grade, description");
  expect(await climbMetadata(climbProps)).toMatchObject({
    title: "Test Highball · V4 · Test Highball Alcove",
    alternates: { canonical: "/climbs/1/test-highball" },
  });
  const metadata = await climbMetadata(climbProps);
  expect(metadata.description).toContain("Public route description sentinel");
  expect(metadata.openGraph).toMatchObject({ description: metadata.description });
  expect(metadata.twitter).toMatchObject({ description: metadata.description });
  expect(JSON.stringify(await areaMetadata(areaProps))).toContain("A test crag.");
});
it("does not reveal whether a profile exists in the page or metadata", async () => {
  for (const id of ["hidden", "missing"]) {
    const props = { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
    expect(await userMetadata(props)).toEqual({
      title: "Member content",
      robots: { index: false },
    });
    const html = renderToStaticMarkup(await UserPage(props));
    expect(html).toContain("Sign in or sign up to see all the content.");
    expect(html).not.toContain("Restricted identity sentinel");
  }
});
it("preserves public canonical redirects and missing-entity errors", async () => {
  await expect(
    ClimbPage({ ...climbProps, params: Promise.resolve({ id: "1", slug: ["stale"] }) }),
  ).rejects.toThrow("REDIRECT:/climbs/1/test-highball");
  await expect(AreaPage({ ...areaProps, params: Promise.resolve({ id: "999" }) })).rejects.toThrow(
    "NOT_FOUND",
  );
});
