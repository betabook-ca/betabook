import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { friendships, journalCompanions, journalEntries, sends, user } from "@/db/schema";
import { buildFeedCards } from "@/lib/feed-groups";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { friendshipPair } from "@/lib/friendships";
import { seedFixtureFriendship, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";
import { getJournalForClimb, getJournalPage } from "./journal";
import { getJournalFilterFriends } from "./journal-companions";

const db = createDb(env.DB);
async function tag(entryId: number, author: string, companion: string) {
  const pair = friendshipPair(author, companion);
  await db.insert(journalCompanions).values({
    entryId,
    userId: companion,
    friendshipUserId: pair.userId,
    friendshipFriendId: pair.friendId,
  });
}
async function entry(author = "author") {
  const [row] = await db
    .insert(journalEntries)
    .values({
      userId: author,
      kind: "session",
      climbId: 1,
      entryDate: "2026-09-01",
      body: "Session",
    })
    .returning();
  return row.id;
}
async function visible(viewer: string | null) {
  return (await getJournalPage(db, "author", viewer, DEFAULT_JOURNAL_FILTER)).entries;
}
async function datedSend() {
  await db.insert(sends).values({
    id: 4000,
    userId: "author",
    climbId: 1,
    dateSent: "2026-09-01",
    ascentStyle: "redpoint",
    comment: "Send note",
  });
  await db.insert(journalEntries).values({
    id: 5000,
    userId: "author",
    kind: "session",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    isAscent: true,
    body: "Send note",
  });
  await tag(5000, "author", "partner");
}
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "partner", "viewer", "stranger"])
    await seedFixtureUser(db, { id, journalVisibility: "public" });
  await seedFixtureFriendship(db, "author", "partner");
  await seedFixtureFriendship(db, "author", "viewer");
});
it("applies the author audience and the companion's only-me opt-out to anonymous, self, friend and stranger readers", async () => {
  const entryId = await entry();
  await tag(entryId, "author", "partner");
  for (const authorAudience of ["private", "friends", "public"] as const) {
    for (const partnerAudience of ["private", "friends", "public"] as const) {
      await db.update(user).set({ journalVisibility: authorAudience }).where(eq(user.id, "author"));
      await db
        .update(user)
        .set({ journalVisibility: partnerAudience })
        .where(eq(user.id, "partner"));
      for (const viewer of [null, "stranger", "viewer", "partner", "author"]) {
        const entries = await visible(viewer);
        const canReadAuthor =
          viewer === "author" ||
          (viewer !== null && authorAudience === "public") ||
          (authorAudience === "friends" && (viewer === "partner" || viewer === "viewer"));
        if (!canReadAuthor) {
          expect(entries).toEqual([]);
          continue;
        }
        expect(entries.map((row) => row.id)).toEqual([entryId]);
        const canSeePartner =
          viewer === "author" || viewer === "partner" || partnerAudience !== "private";
        expect(entries[0].companions).toEqual(
          canSeePartner
            ? [{ id: "partner", name: "Test Climber partner", isSelf: viewer === "partner" }]
            : [],
        );
      }
    }
  }
  await db.update(user).set({ journalVisibility: "public" }).where(eq(user.id, "author"));
  await db.update(user).set({ journalVisibility: "friends" }).where(eq(user.id, "partner"));
  // Befriending the partner adds nothing the author's audience did not already grant.
  await seedFixtureFriendship(db, "partner", "viewer");
  expect((await visible("viewer"))[0].companions).toMatchObject([{ id: "partner" }]);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  expect(await visible(null)).toEqual([]);
  // A private profile does not change who is named: it governs the profile page.
  const partnerName = { id: "partner", name: "Test Climber partner" };
  for (const reader of ["author", "viewer"])
    expect((await visible(reader))[0].companions).toEqual([{ ...partnerName, isSelf: false }]);
  expect((await visible("partner"))[0].companions).toEqual([{ ...partnerName, isSelf: true }]);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "author"));
  expect(await visible("partner")).toEqual([]);
  expect((await visible("author"))[0].id).toBe(entryId);
});
it("unfriend cascades in both directions without affecting other friends; re-friending cannot restore tags", async () => {
  const own = await entry(),
    other = await entry("partner");
  await tag(own, "author", "partner");
  await tag(other, "partner", "author");
  await tag(own, "author", "viewer");
  const pair = friendshipPair("author", "partner");
  await db
    .delete(friendships)
    .where(and(eq(friendships.userId, pair.userId), eq(friendships.friendId, pair.friendId)));
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: own, userId: "viewer" },
  ]);
  expect(await db.select().from(journalEntries)).toHaveLength(2);
  await seedFixtureFriendship(db, "partner", "author");
  expect((await visible("author"))[0].companions).toMatchObject([{ id: "viewer" }]);
  expect(await db.select().from(journalCompanions)).toHaveLength(1);
});
it("uses the same fresh permissions for journal and feed, without altering feed identity or counts", async () => {
  const entryId = await entry();
  await tag(entryId, "author", "partner");
  const first = await getFeedPage(db, "viewer");
  expect(first.days).toHaveLength(1);
  expect(first.days[0]).toMatchObject({
    userId: "author",
    sessions: 1,
    sends: 0,
    activities: [{ id: entryId, kind: "session", companions: [{ id: "partner" }] }],
  });
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "partner"));
  const hidden = await getFeedPage(db, "viewer");
  expect(hidden.days[0]).toMatchObject({
    userId: "author",
    sessions: 1,
    activities: [{ id: entryId, companions: [] }],
  });
  expect(JSON.stringify(hidden)).not.toContain('"partner"');
  const pair = friendshipPair("author", "viewer");
  await db
    .delete(friendships)
    .where(and(eq(friendships.userId, pair.userId), eq(friendships.friendId, pair.friendId)));
  expect((await getFeedPage(db, "viewer")).days).toEqual([]);
});
it("reads companions from the dated ascent and repeat while retaining each author's own feed outcomes", async () => {
  await datedSend();
  const [repeat] = await db
    .insert(journalEntries)
    .values({
      userId: "author",
      kind: "session",
      climbId: 1,
      entryDate: "2026-09-01",
      sent: true,
      body: "Another lap",
    })
    .returning();
  await tag(repeat.id, "author", "partner");
  const partnerEntry = await entry("partner");
  await seedFixtureFriendship(db, "viewer", "partner");
  expect(await visible("viewer")).toMatchObject([
    { id: repeat.id, sent: true, isAscent: false, companions: [{ id: "partner" }] },
    { id: 5000, sent: true, isAscent: true, companions: [{ id: "partner" }] },
  ]);
  expect(await getJournalForClimb(db, "author", "viewer", 1)).toMatchObject([
    { id: repeat.id, companions: [{ id: "partner" }] },
    { id: 5000, companions: [{ id: "partner" }] },
  ]);
  const page = await getFeedPage(db, "viewer");
  expect(page.days).toMatchObject([
    { userId: "partner", sends: 0, repeats: 0, sessions: 1, activities: [{ id: partnerEntry }] },
    {
      userId: "author",
      sends: 1,
      repeats: 1,
      sessions: 0,
      activities: [
        { id: 4000, kind: "send", companions: [{ id: "partner" }] },
        { id: repeat.id, kind: "repeat", companions: [{ id: "partner" }] },
      ],
    },
  ]);
  expect(buildFeedCards(page.days, "all")).toMatchObject([
    {
      kind: "group",
      entries: [
        { day: { userId: "partner" }, activity: { id: partnerEntry, kind: "session" } },
        { day: { userId: "author" }, activity: { id: 4000, kind: "send" } },
        { day: { userId: "author" }, activity: { id: repeat.id, kind: "repeat" } },
      ],
    },
  ]);
  expect((await getFeedPage(db, "viewer", "sends")).days).toMatchObject([
    { userId: "author", sends: 1, activities: [{ id: 4000, kind: "send", companions: [] }] },
  ]);
});
it("keeps send companions behind journal permissions independently of public send facts and commentary", async () => {
  await datedSend();
  await db.update(user).set({ sendCommentVisibility: "public" }).where(eq(user.id, "author"));
  expect((await getFeedPage(db, "viewer")).days[0].activities).toMatchObject([
    { id: 4000, body: "Send note", companions: [{ id: "partner" }] },
  ]);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "author"));
  expect(await visible("viewer")).toEqual([]);
  expect((await visible("author"))[0].companions).toMatchObject([{ id: "partner" }]);
  expect((await getFeedPage(db, "viewer")).days).toMatchObject([
    {
      journalVisible: false,
      sends: 1,
      activities: [{ id: 4000, body: "Send note", companions: [] }],
    },
  ]);
  await db
    .update(user)
    .set({ journalVisibility: "public", sendCommentVisibility: "private" })
    .where(eq(user.id, "author"));
  expect((await getFeedPage(db, "viewer")).days[0].activities).toMatchObject([
    { id: 4000, body: null, companions: [{ id: "partner" }] },
  ]);
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "partner"));
  expect((await visible("viewer"))[0]).toMatchObject({ id: 5000, body: null, companions: [] });
  expect((await getFeedPage(db, "viewer")).days[0].activities[0].companions).toEqual([]);
  // Only me still hides the partner from the viewer; going private on top of it
  // changes nothing, because a private profile is not a journal audience.
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  expect((await visible("author"))[0].companions).toMatchObject([{ id: "partner" }]);
  expect((await visible("viewer"))[0].companions).toEqual([]);
});
it("preserves readable companions when a deleted send leaves independently protected commentary", async () => {
  await datedSend();
  await db.update(user).set({ sendCommentVisibility: "private" }).where(eq(user.id, "author"));
  await db.delete(sends).where(eq(sends.id, 4000));
  expect(await visible("viewer")).toMatchObject([
    {
      id: 5000,
      sent: false,
      isAscent: false,
      isSendComment: true,
      body: null,
      companions: [{ id: "partner" }],
    },
  ]);
  expect((await getFeedPage(db, "viewer")).days).toMatchObject([
    {
      userId: "author",
      sends: 0,
      sessions: 1,
      activities: [
        {
          id: 5000,
          kind: "session",
          body: null,
          companions: [{ id: "partner" }],
        },
      ],
    },
  ]);
});
it("enriches send previews in one statement through the ascent and active-companion indexes", async () => {
  await datedSend();
  const plans = await explainQueries(db, () => getFeedPage(db, "viewer"));
  expect(plans).toHaveLength(1);
  const details = plans[0].map((row) => row.detail).join("\n");
  expect(details).toContain("journal_ascent_unique");
  expect(details).toContain("journal_companions_active_idx");
  expect(details).not.toMatch(/SCAN (?:jc|ascent)(?:\s|$)/);
});
it("never expands feed authors through companion tags in either direction or pending friendships", async () => {
  const friendEntry = await entry("author");
  const nonfriendEntry = await entry("partner");
  await tag(nonfriendEntry, "partner", "author");
  // The nonfriend's journal is public and readable. Feed exclusion must still
  // follow the viewer's accepted authors, rather than the companion graph.
  expect(
    (await getJournalPage(db, "partner", "viewer", DEFAULT_JOURNAL_FILTER)).entries,
  ).toMatchObject([{ id: nonfriendEntry, companions: [{ id: "author" }] }]);
  async function expectOnlyFriend() {
    const page = await getFeedPage(db, "viewer");
    expect(page.days.map((day) => day.userId)).toEqual(["author"]);
    expect(page.days[0]).toMatchObject({
      sends: 0,
      repeats: 0,
      sessions: 1,
      training: 0,
      activities: [{ id: friendEntry, kind: "session" }],
    });
    expect(buildFeedCards(page.days, "all")).toMatchObject([
      { kind: "day", day: { userId: "author", activities: [{ id: friendEntry }] } },
    ]);
    return page;
  }
  const incoming = await expectOnlyFriend();
  expect(incoming.days[0].activities[0].companions).toEqual([]);
  await tag(friendEntry, "author", "partner");
  const outgoing = await expectOnlyFriend();
  // A permitted profile link does not bring its author's entries into the feed.
  expect(outgoing.days[0].activities[0].companions).toMatchObject([{ id: "partner" }]);
  await seedFixtureFriendship(db, "viewer", "partner", "pending");
  await expectOnlyFriend();
  const pair = friendshipPair("viewer", "partner");
  await db
    .update(friendships)
    .set({ status: "accepted" })
    .where(and(eq(friendships.userId, pair.userId), eq(friendships.friendId, pair.friendId)));
  const accepted = await getFeedPage(db, "viewer");
  expect(accepted.days.map((day) => [day.userId, day.activities[0].id])).toEqual([
    ["partner", nonfriendEntry],
    ["author", friendEntry],
  ]);
  expect(buildFeedCards(accepted.days, "all")).toMatchObject([
    {
      kind: "group",
      entries: [
        { day: { userId: "partner" }, activity: { id: nonfriendEntry } },
        { day: { userId: "author" }, activity: { id: friendEntry } },
      ],
    },
  ]);
});
it("cascades entry/account deletion and guards immutable companion and entry identity", async () => {
  const entryId = await entry();
  await tag(entryId, "author", "partner");
  const another = await entry();
  await expect(db.update(journalCompanions).set({ entryId: another })).rejects.toThrow(
    "Failed query",
  );
  await expect(
    db.update(journalEntries).set({ userId: "partner" }).where(eq(journalEntries.id, entryId)),
  ).rejects.toThrow("Failed query");
  await db.update(journalCompanions).set({ suppressed: true });
  await expect(db.update(journalCompanions).set({ suppressed: false })).rejects.toThrow(
    "Failed query",
  );
  await db.delete(journalEntries).where(eq(journalEntries.id, entryId));
  expect(await db.select().from(journalCompanions)).toEqual([]);
  await tag(another, "author", "partner");
  await db.delete(user).where(eq(user.id, "partner"));
  expect(await db.select().from(journalCompanions)).toEqual([]);
  expect((await visible("author"))[0].id).toBe(another);
});
it("keeps active-tag read cost independent of unrelated entries and suppression history", async () => {
  const entryId = await entry();
  await tag(entryId, "author", "partner");
  // Compare growth in an already populated index range. Diagnostics showed
  // the first unrelated row changes the query from 9 to 11 reads, while
  // rows 2–200 add none. Keep exact equality for subsequent growth.
  const baselineOther = await entry("partner");
  await tag(baselineOther, "partner", "author");
  const spy = vi.spyOn(db, "all");
  await visible("author");
  const statement = spy.mock.calls[0][0];
  spy.mockRestore();
  const compiled = new SQLiteSyncDialect().sqlToQuery(statement as ReturnType<typeof sql>);
  async function measure() {
    return env.DB.prepare(compiled.sql)
      .bind(...compiled.params)
      .all();
  }
  const before = await measure();
  for (let i = 0; i < 120; i += 1) {
    const id = `suppressed-${i}`;
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, "author", id);
    await tag(entryId, "author", id);
    await db
      .update(journalCompanions)
      .set({ suppressed: true })
      .where(eq(journalCompanions.userId, id));
  }
  const afterSuppressions = await measure();
  for (let i = 0; i < 200; i += 1) {
    const other = await entry("partner");
    await tag(other, "partner", "author");
  }
  const after = await measure();
  expect(after.results).toEqual(before.results);
  expect(afterSuppressions.meta.rows_read).toBe(before.meta.rows_read);
  expect(after.meta.rows_read).toBe(before.meta.rows_read);
  const details = (await explainQueries(db, () => visible("author")))
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(details).toContain("journal_companions_active_idx");
  expect(details).not.toMatch(/SCAN jc(?:\s|$)/);
  const sendsPlans = (await explainQueries(db, () => getFeedPage(db, "viewer", "sends")))
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(sendsPlans).not.toContain("journal_companions");
  console.warn(
    `Companion scale evidence: rows_read ${before.meta.rows_read} before / ${after.meta.rows_read} after 120 suppressions and 200 unrelated tagged entries.`,
  );
});
it("enforces the active tag cap in D1 and preserves tags through a climb move", async () => {
  const entryId = await entry();
  for (let i = 0; i < 11; i += 1) {
    const id = `friend-${i}`;
    await seedFixtureUser(db, { id });
    await seedFixtureFriendship(db, "author", id);
    if (i < 10) await tag(entryId, "author", id);
  }
  await expect(tag(entryId, "author", "friend-10")).rejects.toThrow("Failed query");
  expect(await db.select().from(journalCompanions)).toHaveLength(10);
  await db.update(journalEntries).set({ climbId: 2 }).where(eq(journalEntries.id, entryId));
  expect((await visible("author"))[0]).toMatchObject({ id: entryId, climbId: 2 });
  expect((await visible("author"))[0].companions).toHaveLength(10);
});

it("filters by visible friend tags only for the owner, including pagination", async () => {
  const tagged = await entry();
  await tag(tagged, "author", "partner");
  const untagged = await entry();
  const filter = { ...DEFAULT_JOURNAL_FILTER, friendIds: ["partner"] };
  expect(
    (await getJournalPage(db, "author", "author", filter, null, 1)).entries.map((row) => row.id),
  ).toEqual([tagged]);
  expect((await getJournalPage(db, "author", "viewer", filter)).entries).toEqual([]);
  expect((await visible("viewer")).map((row) => row.id)).toEqual([untagged, tagged]);
  await db
    .update(journalCompanions)
    .set({ suppressed: true })
    .where(eq(journalCompanions.entryId, tagged));
  expect((await getJournalPage(db, "author", "author", filter)).entries).toEqual([]);
});

it("matches any selected friend and lists all existing friends independently of journal tags", async () => {
  const first = await entry();
  await tag(first, "author", "partner");
  const second = await entry();
  await tag(second, "author", "viewer");
  await entry();
  const filter = { ...DEFAULT_JOURNAL_FILTER, friendIds: ["partner", "viewer"] };
  const page = await getJournalPage(db, "author", "author", filter, null, 1);
  expect(page.entries.map((row) => row.id)).toEqual([second]);
  expect(page.hasMore).toBe(true);
  expect(
    (await getJournalPage(db, "author", "author", filter, page.nextCursor)).entries.map(
      (row) => row.id,
    ),
  ).toEqual([first]);
  expect((await getJournalFilterFriends(db, "author")).map((friend) => friend.id)).toEqual([
    "partner",
    "viewer",
  ]);
  // The author keeps seeing a private friend's tag, so their own filter still finds it.
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  expect(
    (await getJournalPage(db, "author", "author", filter)).entries.map((row) => row.id),
  ).toEqual([second, first]);
});

it("names tagged partners to readers outside the partner's own friends, honoring an only-me opt-out", async () => {
  const entryId = await entry();
  await tag(entryId, "author", "partner");
  const named = [{ id: "partner", name: "Test Climber partner", isSelf: false }];
  // `viewer` is the author's friend but never the partner's; `stranger` is
  // neither, and reads the author's entry through the Members audience.
  for (const partnerAudience of ["friends", "public"] as const) {
    await db.update(user).set({ journalVisibility: partnerAudience }).where(eq(user.id, "partner"));
    expect((await visible("viewer"))[0].companions).toEqual(named);
    expect((await visible("stranger"))[0].companions).toEqual(named);
    expect((await getFeedPage(db, "viewer")).days[0].activities[0].companions).toEqual(named);
  }
  await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "partner"));
  expect((await visible("viewer"))[0].companions).toEqual([]);
  expect((await getFeedPage(db, "viewer")).days[0].activities[0].companions).toEqual([]);
  // The opt-out never hides the tag from the author who wrote it, nor from the
  // partner themselves, who needs it to remove their own tag.
  expect((await visible("author"))[0].companions).toEqual(named);
  expect((await visible("partner"))[0].companions).toEqual([{ ...named[0], isSelf: true }]);
  // A private profile is not an opt-out from being named as company.
  await db.update(user).set({ journalVisibility: "friends" }).where(eq(user.id, "partner"));
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  for (const reader of ["viewer", "stranger", "author"])
    expect((await visible(reader))[0].companions).toEqual(named);
  expect((await visible("partner"))[0].companions).toEqual([{ ...named[0], isSelf: true }]);
});
