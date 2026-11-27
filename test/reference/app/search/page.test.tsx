import { env } from "cloudflare:test";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { SearchView } from "@/app/search-view";
import FindClimbsPage, { metadata } from "@/app/search/page";
import { AppSearch } from "@/components/search/app-search";
import { createDb } from "@/db/client";
import type { SearchSnapshot, SearchState } from "@/lib/search";
import { seedFixtureTree, seedFixtureUser, seedFixtureSend } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({ viewer: null as string | null }));
vi.mock("@/lib/session", () => ({
  getMemberSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));
vi.mock("@/components/search/app-search", () => ({ AppSearch: () => null }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
beforeEach(async () => {
  state.viewer = null;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "reader" });
  await seedFixtureSend(db, { userId: "reader", climbId: 1, dateSent: "2026-09-01" });
});

type SearchProps = {
  initialState: SearchState;
  initial: SearchSnapshot;
  viewerId: string | null;
  defaultCategory?: SearchState["category"];
  showMemberNotice?: boolean;
  memberNoticePlacement?: "results" | "top";
};
function find(node: ReactNode, type: unknown): unknown {
  for (const child of Array.isArray(node) ? node : [node]) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === type) return child.props;
    if (child.props.children) {
      try {
        return find(child.props.children, type);
      } catch {
        /* Search siblings. */
      }
    }
  }
  throw new Error("Not rendered");
}
/** The page's search, resolved through the shared server view to its client props. */
async function search(params: Record<string, string | string[]>): Promise<SearchProps> {
  const view = find(
    await FindClimbsPage({ searchParams: Promise.resolve(params) }),
    SearchView,
  ) as Parameters<typeof SearchView>[0];
  return find(await SearchView(view), AppSearch) as SearchProps;
}
const summary = (data: SearchProps) =>
  data.initial.map((section) => [section.kind, section.status, section.page.items.length]);

it("stays out of the index in every state", () => {
  expect(metadata).toEqual({ title: "Find climbs", robots: { index: false } });
});

it("opens on the climb list and browses the whole catalog without a name", async () => {
  const data = await search({});
  expect(data.defaultCategory).toBe("climb");
  expect(data.showMemberNotice).toBe(true);
  expect(data.memberNoticePlacement).toBe("top");
  expect(data.initialState.category).toBe("climb");
  expect(summary(data)).toEqual([["climb", "ready", 4]]);
  // Most ascents first: the sent fixture climb leads.
  expect(data.initial[0].page.items[0]).toMatchObject({ id: "climb-1", name: "Test Highball" });
  // Signed out, the page still shows public catalog facts and nothing about a viewer.
  expect(data.viewerId).toBeNull();
  expect(JSON.stringify(data.initial)).not.toContain('"context"');
});

it("narrows the nameless climb list by area, discipline and grade for a member", async () => {
  state.viewer = "reader";
  const data = await search({ areaId: "3", discipline: "sport" });
  expect(data.initialState.area).toMatchObject({ id: "3", name: "Test Sport Wall" });
  expect(data.initial[0].page.items).toMatchObject([
    { id: "climb-3", name: "Test Crimper", discipline: "sport", context: { sent: false } },
  ]);
  const sent = await search({ discipline: "boulder", boulderRange: ["4", "6"] });
  expect(sent.initial[0].page.items).toMatchObject([{ id: "climb-1", context: { sent: true } }]);
});

it("keeps every other category waiting for a name", async () => {
  expect(summary(await search({ mode: "all" }))).toEqual([
    ["climb", "idle", 0],
    ["area", "idle", 0],
    ["climber", "locked", 0],
  ]);
  expect(summary(await search({ mode: "area", name: "  " }))).toEqual([["area", "idle", 0]]);
  state.viewer = "reader";
  expect(summary(await search({ mode: "all" }))).toEqual([
    ["climb", "idle", 0],
    ["area", "idle", 0],
    ["climber", "idle", 0],
  ]);
  expect(summary(await search({ mode: "area", name: "Test" }))).toEqual([["area", "ready", 5]]);
});

it("titles the page for finding a project", async () => {
  const html = renderToStaticMarkup(
    <div>{(await FindClimbsPage({ searchParams: Promise.resolve({}) })).props.children[0]}</div>,
  );
  expect(html).toContain("Find climbs");
  expect(html).toContain("Browse an area by grade, rating and ascents");
});
