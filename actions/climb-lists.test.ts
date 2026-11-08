import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addClimbToList,
  copyClimbList,
  createClimbList,
  deleteClimbList,
  removeClimbFromList,
  reorderClimbList,
  setClimbListVisibility,
  shareClimbList,
  unshareClimbList,
  updateClimbList,
} from "@/actions";
import { createDb } from "@/db/client";
import {
  getClimbListChoices,
  getClimbListForUser,
  getClimbListItems,
  getClimbListShareForOwner,
  getClimbListsForUser,
  getProfileAccess,
  getSharedClimbList,
  getSharedClimbListItems,
} from "@/db/queries";
import { climbListItems, climbListShareLinks, climbLists, climbs, user } from "@/db/schema";
import {
  CLIMB_LIST_CHANGED_MESSAGE,
  CLIMB_LIST_LIMIT_MESSAGE,
  CLIMB_LIST_NOT_FOUND_MESSAGE,
  CLIMB_LIST_UNAVAILABLE_MESSAGE,
  DEFAULT_CLIMB_LIST_SORT,
  MAX_CLIMB_LISTS,
  type ClimbListView,
} from "@/lib/climb-lists";
import {
  seedFixtureFriendship,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "owner" as string | null }));
const limits = vi.hoisted(() => ({ allow: true }));
vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<() => void>(),
}));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!identity.id) throw new NotSignedInError();
      return { user: { id: identity.id } };
    },
  };
});
const budgets = vi.hoisted(() => ({ list: 0, journal: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: async () => {
    budgets.journal += 1;
    return limits.allow;
  },
  allowClimbListWrite: async () => {
    budgets.list += 1;
    return limits.allow;
  },
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);
const LIST_ORDER: ClimbListView = { sort: DEFAULT_CLIMB_LIST_SORT, sent: "all" };

function as(id: string | null) {
  identity.id = id;
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.value;
}

function errorOf(result: { ok: boolean; error?: string }) {
  return result.ok ? null : result.error;
}

/** Creates a list for `owner` holding `climbIds` in that order. */
async function seedList(owner: string, title: string, climbIds: number[] = []) {
  as(owner);
  const id = value(await createClimbList({ title, description: `About ${title}` }));
  for (const climbId of climbIds) value(await addClimbToList(id, climbId));
  return id;
}

async function order(listId: number) {
  const rows = await db
    .select({ climbId: climbListItems.climbId })
    .from(climbListItems)
    .where(eq(climbListItems.listId, listId))
    .orderBy(climbListItems.position);
  return rows.map((row) => row.climbId);
}

/** Gives `owner` the maximum number of lists in one statement. */
async function fillLists(owner: string) {
  await db.run(sql`
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${MAX_CLIMB_LISTS})
    INSERT INTO climb_lists (user_id, title) SELECT ${owner}, 'List ' || i FROM n
  `);
}

async function listCount(owner: string) {
  const rows = await db.select().from(climbLists).where(eq(climbLists.userId, owner));
  return rows.length;
}

beforeEach(async () => {
  as("owner");
  limits.allow = true;
  budgets.list = 0;
  budgets.journal = 0;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "List Owner" });
  await seedFixtureUser(db, { id: "friend", name: "List Friend" });
  await seedFixtureUser(db, { id: "member", name: "List Member" });
  await seedFixtureFriendship(db, "owner", "friend");
});

describe("creating and editing lists", () => {
  it("creates a list with a trimmed name and appends climbs in the order added", async () => {
    as("owner");
    const id = value(await createClimbList({ title: "  Red   River  ", description: "" }));
    value(await addClimbToList(id, 3));
    value(await addClimbToList(id, 1));
    value(await addClimbToList(id, 3));

    const [stored] = await db.select().from(climbLists).where(eq(climbLists.id, id));
    expect(stored.title).toBe("Red River");
    expect(stored.description).toBeNull();
    expect(await order(id)).toEqual([3, 1]);
  });

  it("creates a list with its first climb from the Add to list drawer", async () => {
    as("owner");
    const id = value(await createClimbList({ title: "Projects" }, { climbId: 2 }));
    expect(await order(id)).toEqual([2]);
    expect(await getClimbListChoices(db, "owner", 2)).toEqual([
      { id, title: "Projects", climbCount: 1, hasClimb: true },
    ]);
  });

  it("refuses a blank name and writes nothing", async () => {
    as("owner");
    expect(errorOf(await createClimbList({ title: "   " }))).toBe("Name your list.");
    expect(await listCount("owner")).toBe(0);
  });

  it("stops at the list limit", async () => {
    await fillLists("owner");
    as("owner");
    expect(errorOf(await createClimbList({ title: "One more" }))).toBe(CLIMB_LIST_LIMIT_MESSAGE);
    expect(await listCount("owner")).toBe(MAX_CLIMB_LISTS);
  });

  it("refuses another climber's list for every owner-only write and leaves it unchanged", async () => {
    const id = await seedList("owner", "Mine", [1, 2]);
    as("member");
    expect(errorOf(await updateClimbList(id, { title: "Taken" }))).toBe(
      CLIMB_LIST_NOT_FOUND_MESSAGE,
    );
    expect(errorOf(await addClimbToList(id, 3))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
    expect(errorOf(await reorderClimbList(id, [2, 1]))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
    expect(errorOf(await shareClimbList(id, "30d"))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
    expect(errorOf(await removeClimbFromList(id, 1))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
    value(await deleteClimbList(id));

    const [stored] = await db.select().from(climbLists).where(eq(climbLists.id, id));
    expect(stored.title).toBe("Mine");
    expect(await order(id)).toEqual([1, 2]);
    expect(await db.select().from(climbListShareLinks)).toHaveLength(0);
  });

  it("deletes the list with its climbs and link, leaving the climbs in the catalog", async () => {
    const id = await seedList("owner", "Gone", [1]);
    value(await shareClimbList(id, "never"));
    value(await deleteClimbList(id));

    expect(await db.select().from(climbListItems)).toHaveLength(0);
    expect(await db.select().from(climbListShareLinks)).toHaveLength(0);
    expect(await db.select().from(climbs).where(eq(climbs.id, 1))).toHaveLength(1);
  });
});

describe("review fixes", () => {
  it("leaves no empty list behind when the first climb doesn't exist", async () => {
    as("owner");
    expect(errorOf(await createClimbList({ title: "Ghost" }, { climbId: 999_999 }))).toBe(
      "Climb not found",
    );
    expect(await listCount("owner")).toBe(0);
  });

  it("spends the list budget, not the journal's, on list writes", async () => {
    const id = await seedList("owner", "Budget", [1]);
    value(await addClimbToList(id, 2));
    value(await removeClimbFromList(id, 2));
    value(await reorderClimbList(id, [1]));
    value(await shareClimbList(id, "never"));
    expect(budgets.journal).toBe(0);
    expect(budgets.list).toBeGreaterThanOrEqual(6);

    limits.allow = false;
    expect(errorOf(await addClimbToList(id, 3))).toBe("Too many changes — try again in a minute");
    expect(await order(id)).toEqual([1]);
  });

  it("refuses an empty reorder of someone else's empty list", async () => {
    const id = await seedList("owner", "Empty");
    as("member");
    expect(errorOf(await reorderClimbList(id, []))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
    as("owner");
    value(await reorderClimbList(id, []));
  });

  it("reports the real count, and moves the list up only when something changed", async () => {
    const id = await seedList("owner", "Counts", [1]);
    await db.run(sql`UPDATE climb_lists SET updated_at = 1 WHERE id = ${id}`);
    const updatedAt = async () =>
      (await db.select().from(climbLists).where(eq(climbLists.id, id)))[0].updatedAt.getTime();

    expect(value(await addClimbToList(id, 1))).toEqual({ changed: false, climbCount: 1 });
    expect(value(await removeClimbFromList(id, 3))).toEqual({ changed: false, climbCount: 1 });
    expect(await updatedAt()).toBe(1);

    expect(value(await addClimbToList(id, 2))).toEqual({ changed: true, climbCount: 2 });
    expect(await updatedAt()).toBeGreaterThan(1);
    expect(value(await removeClimbFromList(id, 2))).toEqual({ changed: true, climbCount: 1 });

    as("member");
    expect(errorOf(await removeClimbFromList(id, 1))).toBe(CLIMB_LIST_NOT_FOUND_MESSAGE);
  });

  it("refreshes the page after a no-op add or remove, so a stale tab catches up", async () => {
    const id = await seedList("owner", "Two tabs", [1]);
    vi.mocked(refresh).mockClear();
    // Another tab already removed climb 2, and already added climb 1.
    value(await removeClimbFromList(id, 2));
    value(await addClimbToList(id, 1));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("leaves no list behind when a create with a first climb hits the cap", async () => {
    await fillLists("owner");
    as("owner");
    expect(errorOf(await createClimbList({ title: "One more" }, { climbId: 1 }))).toBe(
      CLIMB_LIST_LIMIT_MESSAGE,
    );
    expect(await listCount("owner")).toBe(MAX_CLIMB_LISTS);
  });

  it("creates a list with its first climb", async () => {
    as("owner");
    const id = value(await createClimbList({ title: "Starter" }, { climbId: 2 }));
    expect(await order(id)).toEqual([2]);
  });
});

describe("reordering", () => {
  it("saves the submitted order", async () => {
    const id = await seedList("owner", "Circuit", [1, 2, 3]);
    value(await reorderClimbList(id, [3, 1, 2]));
    expect(await order(id)).toEqual([3, 1, 2]);
  });

  it("refuses an order made before another tab changed the list", async () => {
    const id = await seedList("owner", "Circuit", [1, 2]);
    value(await addClimbToList(id, 3));

    expect(errorOf(await reorderClimbList(id, [2, 1]))).toBe(CLIMB_LIST_CHANGED_MESSAGE);
    expect(errorOf(await reorderClimbList(id, [2, 1, 4]))).toBe(CLIMB_LIST_CHANGED_MESSAGE);
    expect(errorOf(await reorderClimbList(id, [2, 2, 1]))).toBe(CLIMB_LIST_CHANGED_MESSAGE);
    expect(await order(id)).toEqual([1, 2, 3]);
  });
});

describe("who can see lists", () => {
  it("defaults the lists audience to Friends", async () => {
    const [row] = await db.select().from(user).where(eq(user.id, "owner"));
    expect(row.climbListVisibility).toBe("friends");
  });

  it.each([
    ["private", { owner: true, friend: false, member: false }],
    ["friends", { owner: true, friend: true, member: false }],
    ["public", { owner: true, friend: true, member: true }],
  ] as const)("with the audience at %s", async (audience, expected) => {
    const id = await seedList("owner", "Classics", [1]);
    as("owner");
    value(await setClimbListVisibility(audience));

    for (const viewer of ["owner", "friend", "member"] as const) {
      const visible = expected[viewer];
      expect((await getProfileAccess(db, "owner", viewer)).lists).toBe(visible);
      expect((await getClimbListsForUser(db, "owner", viewer)).map((l) => l.id)).toEqual(
        visible ? [id] : [],
      );
      expect((await getClimbListForUser(db, "owner", id, viewer))?.id ?? null).toBe(
        visible ? id : null,
      );
      expect((await getClimbListItems(db, "owner", id, viewer, LIST_ORDER)).length).toBe(
        visible ? 1 : 0,
      );
    }
    expect(await getClimbListsForUser(db, "owner", null)).toEqual([]);
  });

  it("hides a private profile's lists from everyone but the owner", async () => {
    const id = await seedList("owner", "Classics", [1]);
    value(await setClimbListVisibility("public"));
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));

    expect(await getClimbListForUser(db, "owner", id, "friend")).toBeNull();
    expect((await getClimbListForUser(db, "owner", id, "owner"))?.id).toBe(id);
  });

  it("accepts only the three audiences", async () => {
    as("owner");
    expect((await setClimbListVisibility("everyone")).ok).toBe(false);
    const [row] = await db.select().from(user).where(eq(user.id, "owner"));
    expect(row.climbListVisibility).toBe("friends");
  });
});

describe("viewing a list", () => {
  async function view(listId: number, viewer: string | null, next: Partial<ClimbListView>) {
    const items = await getClimbListItems(db, "owner", listId, viewer, {
      ...LIST_ORDER,
      ...next,
    });
    return items.map((item) => item.climbId);
  }

  it("sorts without changing the owner's order and keeps each climb's position", async () => {
    // Highball V4 (1), Slab V1 (2), Crimper 5.10a (3), Crack 5.6 (4).
    const id = await seedList("owner", "Mixed", [3, 2, 4, 1]);

    expect(await view(id, "owner", {})).toEqual([3, 2, 4, 1]);
    // Boulders before routes, hardest first within each.
    expect(await view(id, "owner", { sort: "grade_desc" })).toEqual([1, 2, 3, 4]);
    expect(await view(id, "owner", { sort: "grade_asc" })).toEqual([2, 1, 4, 3]);
    expect(await view(id, "owner", { sort: "name_asc" })).toEqual([4, 3, 1, 2]);
    // Test Crag > Test Boulders > Test Highball Alcove / Test Slab Area, then
    // Test Crag > Test Sport Wall, where the two routes keep list order.
    expect(await view(id, "owner", { sort: "area_asc" })).toEqual([1, 2, 3, 4]);

    const sorted = await getClimbListItems(db, "owner", id, "owner", {
      ...LIST_ORDER,
      sort: "name_asc",
    });
    expect(sorted.map((item) => [item.climbId, item.position])).toEqual([
      [4, 3],
      [3, 1],
      [1, 4],
      [2, 2],
    ]);
    expect(await order(id)).toEqual([3, 2, 4, 1]);
  });

  it("filters by the reader's own sends, never the owner's", async () => {
    const id = await seedList("owner", "Ticks", [1, 2, 3]);
    value(await setClimbListVisibility("public"));
    await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-01-01" });
    await seedFixtureSend(db, { userId: "member", climbId: 2, dateSent: "2026-01-01" });

    expect(await view(id, "owner", { sent: "sent" })).toEqual([1]);
    expect(await view(id, "member", { sent: "sent" })).toEqual([2]);
    expect(await view(id, "member", { sent: "unsent" })).toEqual([1, 3]);
    const items = await getClimbListItems(db, "owner", id, "member", LIST_ORDER);
    expect(items.map((item) => item.sent)).toEqual([false, true, false]);
  });
});

describe("share links", () => {
  it("opens one list even when the owner's lists are Only me", async () => {
    const id = await seedList("owner", "Shared", [1, 2]);
    await seedList("owner", "Not shared", [3]);
    value(await setClimbListVisibility("private"));
    const { token } = value(await shareClimbList(id, "30d"));

    const access = await getSharedClimbList(db, token);
    expect(access.status === "visible" && access.shared.list.title).toBe("Shared");
    const items = await getSharedClimbListItems(db, token, null, LIST_ORDER);
    expect(items.map((item) => [item.climbId, item.sent])).toEqual([
      [1, null],
      [2, null],
    ]);
  });

  it("stops answering when unshared, expired, or the profile goes private", async () => {
    const id = await seedList("owner", "Shared", [1]);
    const { token } = value(await shareClimbList(id, "30d"));

    await db.run(sql`UPDATE climb_list_share_links SET expires_at = datetime('now', '-1 minute')`);
    expect((await getSharedClimbList(db, token)).status).toBe("expired");
    expect(await getSharedClimbListItems(db, token, null, LIST_ORDER)).toEqual([]);

    const renewed = value(await shareClimbList(id, "30d"));
    expect(renewed.token).not.toBe(token);

    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
    expect(await db.select().from(climbListShareLinks)).toHaveLength(0);
    expect((await getSharedClimbList(db, renewed.token)).status).toBe("hidden");

    await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
    expect((await getSharedClimbList(db, renewed.token)).status).toBe("hidden");
  });

  it("hands the token only to its owner, and not once it has expired", async () => {
    const id = await seedList("owner", "Shared", [1]);
    const { token } = value(await shareClimbList(id, "30d"));
    expect((await getClimbListShareForOwner(db, "owner", id))?.token).toBe(token);
    expect(await getClimbListShareForOwner(db, "member", id)).toBeNull();

    await db.run(sql`UPDATE climb_list_share_links SET expires_at = datetime('now', '-1 minute')`);
    expect(await getClimbListShareForOwner(db, "owner", id)).toBeNull();
  });

  it("closes a link at once", async () => {
    const id = await seedList("owner", "Shared", [1]);
    const { token } = value(await shareClimbList(id, "never"));
    value(await unshareClimbList(id));
    expect((await getSharedClimbList(db, token)).status).toBe("hidden");
  });
});

describe("copying", () => {
  it("copies another climber's visible list under the name and description given", async () => {
    const source = await seedList("owner", "Classics", [3, 1, 2]);
    as("friend");
    const copy = value(
      await copyClimbList({ listId: source }, { title: "My classics", description: "Mine now" }),
    );

    const [stored] = await db.select().from(climbLists).where(eq(climbLists.id, copy));
    expect(stored).toMatchObject({
      userId: "friend",
      title: "My classics",
      description: "Mine now",
    });
    expect(await order(copy)).toEqual([3, 1, 2]);
    expect(await order(source)).toEqual([3, 1, 2]);
  });

  it("is a snapshot: later edits to the original don't reach the copy", async () => {
    const source = await seedList("owner", "Classics", [1]);
    as("friend");
    const copy = value(await copyClimbList({ listId: source }, { title: "Classics" }));
    as("owner");
    value(await addClimbToList(source, 2));
    expect(await order(copy)).toEqual([1]);
  });

  it("copies the owner's own list even when their lists are Only me and the profile is private", async () => {
    const source = await seedList("owner", "Mine", [2, 1]);
    value(await setClimbListVisibility("private"));
    value(await shareClimbList(source, "never"));
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));

    const copy = value(await copyClimbList({ listId: source }, { title: "Mine (copy)" }));
    expect(await order(copy)).toEqual([2, 1]);
    expect(
      await db.select().from(climbListShareLinks).where(eq(climbListShareLinks.listId, copy)),
    ).toHaveLength(0);
  });

  it("copies through a live link the reader holds", async () => {
    const source = await seedList("owner", "Linked", [1, 2]);
    value(await setClimbListVisibility("private"));
    const { token } = value(await shareClimbList(source, "30d"));

    as("member");
    const copy = value(await copyClimbList({ token }, { title: "From the link" }));
    expect(await order(copy)).toEqual([1, 2]);
  });

  it.each([
    [
      "the owner's lists are hidden from the reader",
      async () => {
        as("owner");
        value(await setClimbListVisibility("friends"));
      },
    ],
    [
      "the owner went private",
      async () => {
        await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
      },
    ],
  ])("refuses when %s and writes nothing", async (_, setUp) => {
    const source = await seedList("owner", "Hidden", [1]);
    await setUp();
    as("member");
    expect(errorOf(await copyClimbList({ listId: source }, { title: "Nope" }))).toBe(
      CLIMB_LIST_UNAVAILABLE_MESSAGE,
    );
    expect(await listCount("member")).toBe(0);
  });

  it("refuses an expired link and a list deleted since the page loaded", async () => {
    const source = await seedList("owner", "Gone soon", [1]);
    const { token } = value(await shareClimbList(source, "30d"));
    await db.run(sql`UPDATE climb_list_share_links SET expires_at = datetime('now', '-1 minute')`);

    as("member");
    expect(errorOf(await copyClimbList({ token }, { title: "Nope" }))).toBe(
      CLIMB_LIST_UNAVAILABLE_MESSAGE,
    );
    as("owner");
    value(await deleteClimbList(source));
    as("friend");
    expect(errorOf(await copyClimbList({ listId: source }, { title: "Nope" }))).toBe(
      CLIMB_LIST_UNAVAILABLE_MESSAGE,
    );
    expect(await listCount("member")).toBe(0);
    expect(await listCount("friend")).toBe(0);
  });

  it("refuses at the list limit without touching the reader's newest list", async () => {
    const source = await seedList("owner", "Classics", [1, 2]);
    await fillLists("friend");
    as("friend");
    expect(errorOf(await copyClimbList({ listId: source }, { title: "Copy" }))).toBe(
      CLIMB_LIST_LIMIT_MESSAGE,
    );
    expect(await listCount("friend")).toBe(MAX_CLIMB_LISTS);
    expect(await db.select().from(climbListItems)).toHaveLength(2);
  });

  it("refuses an empty name and writes nothing", async () => {
    const source = await seedList("owner", "Classics", [1]);
    as("friend");
    expect(errorOf(await copyClimbList({ listId: source }, { title: " " }))).toBe(
      "Name your list.",
    );
    expect(await listCount("friend")).toBe(0);
  });
});
