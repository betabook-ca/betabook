import { env } from "cloudflare:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import FriendsPage from "@/app/friends/page";
import { FriendList } from "@/components/friend-list";
import { FriendSuggestions } from "@/components/friend-suggestions";
import { FriendsContent } from "@/components/friends-content";
import { FriendsSearch } from "@/components/friends-search";
import { createDb } from "@/db/client";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const failure = vi.hoisted(() => ({ suggestions: false }));
vi.mock("@/db/queries", async (original) => {
  const actual = await original<typeof import("@/db/queries")>();
  return {
    ...actual,
    getClimberSuggestions: (...args: Parameters<typeof actual.getClimberSuggestions>) =>
      failure.suggestions
        ? Promise.reject(new Error("D1 timeout"))
        : actual.getClimberSuggestions(...args),
  };
});
vi.mock("@/lib/session", () => ({ getMemberSession: async () => ({ user: { id: "viewer" } }) }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));

function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === FriendsContent)
    return findElements(FriendsContent(node.props as Parameters<typeof FriendsContent>[0]), type);
  return [
    ...(node.type === type ? [node as ReactElement<Record<string, unknown>>] : []),
    ...findElements(node.props.children, type),
  ];
}
const db = createDb(env.DB);
beforeEach(async () => {
  failure.suggestions = false;
  await resetDb(db);
  await seedFixtureUser(db, { id: "viewer", name: "Viewer" });
  await seedFixtureUser(db, { id: "partner", name: "Partner" });
  await seedFixtureUser(db, { id: "crag-mate", name: "Crag Mate" });
  await seedFixtureFriendship(db, "viewer", "partner");
  await seedFixtureFriendship(db, "partner", "crag-mate");
});

it("suggests the viewer's friends of friends with Friends but not Requests", async () => {
  const all = await FriendsPage({ searchParams: Promise.resolve({}) });
  expect(findElements(all, FriendSuggestions).map((element) => element.props.climbers)).toEqual([
    [
      {
        id: "crag-mate",
        name: "Crag Mate",
        image: null,
        friendshipStatus: "none",
        mutualFriendCount: 1,
      },
    ],
  ]);
  const requests = await FriendsPage({ searchParams: Promise.resolve({ view: "requests" }) });
  expect(findElements(requests, FriendSuggestions)).toEqual([]);
});

it("keeps the friend list when suggestions fail to load", async () => {
  failure.suggestions = true;
  const all = await FriendsPage({ searchParams: Promise.resolve({}) });
  expect(findElements(all, FriendList).map((element) => element.props.initialPage)).toEqual([
    expect.objectContaining({ friends: [expect.objectContaining({ id: "partner" })] }),
  ]);
  expect(findElements(all, FriendSuggestions)).toEqual([]);
});

it("combines search and friends and accepts legacy discovery links", async () => {
  const all = await FriendsPage({ searchParams: Promise.resolve({}) });
  expect(findElements(all, FriendsSearch)).toHaveLength(1);
  const discovery = await FriendsPage({ searchParams: Promise.resolve({ view: "discover" }) });
  expect(findElements(discovery, FriendsSearch)).toHaveLength(1);
  expect(findElements(discovery, FriendList)).toHaveLength(1);
  expect(findElements(discovery, FriendSuggestions)).toHaveLength(1);
});
