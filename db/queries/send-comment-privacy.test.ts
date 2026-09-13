import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { friendships, journalEntries, sends, user } from "@/db/schema";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";
import { getJournalForClimb, getJournalPage } from "./journal";
import { getSendsForClimb, getSendsForUserPage } from "./sends";

const db = createDb(env.DB);
const viewers = ["owner", "a-friend", "z-friend", "pending-in", "pending-out", "stranger", null];
const audiences = ["private", "friends", "public"] as const;
const commentAudiences = [...audiences, "everyone"] as const;
const readers: Record<(typeof commentAudiences)[number], (string | null)[]> = {
  private: ["owner"],
  friends: ["owner", "a-friend", "z-friend"],
  public: viewers.filter((viewer) => viewer !== null),
  everyone: viewers,
};

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of viewers) if (id) await seedFixtureUser(db, { id });
  await seedFixtureFriendship(db, "a-friend", "owner");
  await seedFixtureFriendship(db, "owner", "z-friend");
  await seedFixtureFriendship(db, "pending-in", "owner", "pending");
  await seedFixtureFriendship(db, "owner", "pending-out", "pending");
  await seedFixtureSend(db, {
    id: 10,
    userId: "owner",
    climbId: 1,
    dateSent: "2026-09-01",
    comment: "secret-beta",
  });
  await seedFixtureSend(db, {
    id: 11,
    userId: "owner",
    climbId: 3,
    dateSent: null,
    comment: "undated-beta",
  });
  await seedFixtureJournalEntry(db, {
    id: 20,
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    isAscent: true,
    body: "secret-beta",
    tags: ["day-tag"],
  });
  await seedFixtureJournalEntry(db, {
    id: 21,
    userId: "owner",
    climbId: 2,
    entryDate: "2026-09-01",
    body: "Session notes",
  });
  await seedFixtureJournalEntry(db, {
    id: 22,
    userId: "owner",
    kind: "training",
    entryDate: "2026-09-01",
    body: "Training notes",
  });
});

it.each(["Drizzle", "SQL"])(
  "defaults new %s accounts to public commentary and a friends-only journal",
  async (insert) => {
    const author = "new-climber";
    if (insert === "Drizzle") {
      await seedFixtureUser(db, { id: author });
    } else {
      await db.run(sql`INSERT INTO user (id, name, email)
        VALUES (${author}, 'New Climber', 'new-climber@example.com')`);
    }
    await seedFixtureFriendship(db, "a-friend", author);
    await seedFixtureFriendship(db, author, "pending-out", "pending");
    await seedFixtureSend(db, {
      id: 12,
      userId: author,
      climbId: 2,
      dateSent: null,
      comment: "Public beta",
    });
    await seedFixtureJournalEntry(db, {
      id: 23,
      userId: author,
      kind: "training",
      entryDate: "2026-09-02",
      body: "Training with friends",
    });
    for (const viewer of [author, "a-friend", "pending-out", "stranger", null]) {
      const sends = await getSendsForUserPage(db, author, DEFAULT_USER_SENDS_FILTER, 0, 20, viewer);
      expect
        .soft(sends.sends.map((row) => [row.id, row.comment]))
        .toEqual([[12, viewer === null ? null : "Public beta"]]);
      const journal = await getJournalPage(db, author, viewer, DEFAULT_JOURNAL_FILTER);
      expect
        .soft(journal.entries.map((row) => [row.id, row.body]))
        .toEqual(viewer === author || viewer === "a-friend" ? [[23, "Training with friends"]] : []);
    }
  },
);

it.each(
  audiences.flatMap((journalVisibility) =>
    commentAudiences.map((sendCommentVisibility) => ({ journalVisibility, sendCommentVisibility })),
  ),
)(
  "keeps $sendCommentVisibility commentary independent of a $journalVisibility journal",
  async ({ journalVisibility, sendCommentVisibility }) => {
    await db
      .update(user)
      .set({ journalVisibility, sendCommentVisibility })
      .where(eq(user.id, "owner"));
    for (const viewer of viewers) {
      const journalReadable = readers[journalVisibility].includes(viewer);
      const commentReadable = readers[sendCommentVisibility].includes(viewer);
      const comment = commentReadable ? "secret-beta" : null;
      const sends = await getSendsForUserPage(
        db,
        "owner",
        DEFAULT_USER_SENDS_FILTER,
        0,
        20,
        viewer,
      );
      expect(sends.sends.map((row) => [row.id, row.comment])).toEqual([
        [10, comment],
        [11, commentReadable ? "undated-beta" : null],
      ]);
      expect((await getSendsForClimb(db, 1, 0, 10, viewer)).sends).toMatchObject([
        { id: 10, comment },
      ]);
      const journal = await getJournalPage(db, "owner", viewer, DEFAULT_JOURNAL_FILTER);
      expect(journal.entries.map((entry) => [entry.id, entry.body])).toEqual(
        journalReadable
          ? [
              [22, "Training notes"],
              [21, "Session notes"],
              [20, comment],
            ]
          : [],
      );
      expect((await getJournalForClimb(db, "owner", viewer, 1)).map((entry) => entry.body)).toEqual(
        journalReadable ? [comment] : [],
      );
      const search = await getJournalPage(db, "owner", viewer, {
        ...DEFAULT_JOURNAL_FILTER,
        query: "secret-beta",
      });
      expect(search.entries.map((entry) => entry.id)).toEqual(
        journalReadable && commentReadable ? [20] : [],
      );
      if (viewer === "a-friend" || viewer === "z-friend") {
        const feed = await getFeedPage(db, viewer);
        expect(feed.days).toHaveLength(1);
        expect(feed.days[0]).toMatchObject({
          userId: "owner",
          sends: 1,
          sessions: journalReadable ? 1 : 0,
          training: journalReadable ? 1 : 0,
        });
        expect(feed.days[0].activities.map((entry) => [entry.kind, entry.body])).toEqual(
          journalReadable
            ? [
                ["send", comment],
                ["session", "Session notes"],
                ["training", "Training notes"],
              ]
            : [["send", comment]],
        );
      }
    }
  },
);

it("a private profile overrides both public audiences without erasing their saved values", async () => {
  await db
    .update(user)
    .set({ isPrivate: true, journalVisibility: "public", sendCommentVisibility: "public" })
    .where(eq(user.id, "owner"));
  for (const viewer of ["a-friend", "stranger", null]) {
    expect((await getSendsForClimb(db, 1, 0, 10, viewer)).sends).toMatchObject([
      { id: -1, userId: null, userName: null, dateSent: "2026-09", comment: null },
    ]);
    expect((await getJournalPage(db, "owner", viewer, DEFAULT_JOURNAL_FILTER)).entries).toEqual([]);
  }
  expect((await getFeedPage(db, "a-friend")).days).toEqual([]);
  expect(
    (await getJournalPage(db, "owner", "owner", DEFAULT_JOURNAL_FILTER)).entries.map(
      (entry) => entry.body,
    ),
  ).toEqual(["Training notes", "Session notes", "secret-beta"]);
  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
  expect((await getSendsForClimb(db, 1, 0, 10, "stranger")).sends[0].comment).toBe("secret-beta");
  expect(
    (await getJournalPage(db, "owner", "stranger", DEFAULT_JOURNAL_FILTER)).entries,
  ).toHaveLength(3);
});

it("revokes friends-only commentary immediately while leaving a public journal readable", async () => {
  await db
    .update(user)
    .set({ journalVisibility: "public", sendCommentVisibility: "friends" })
    .where(eq(user.id, "owner"));
  expect((await getJournalForClimb(db, "owner", "a-friend", 1))[0].body).toBe("secret-beta");
  await db.delete(friendships).where(eq(friendships.userId, "a-friend"));
  expect((await getJournalForClimb(db, "owner", "a-friend", 1))[0].body).toBeNull();
  expect((await getSendsForClimb(db, 1, 0, 10, "a-friend")).sends[0].comment).toBeNull();
  expect((await getJournalForClimb(db, "owner", "z-friend", 1))[0].body).toBe("secret-beta");
});

it("keeps retained send commentary private after deleting a send and editing its journal entry", async () => {
  await db
    .update(user)
    .set({ journalVisibility: "public", sendCommentVisibility: "private" })
    .where(eq(user.id, "owner"));
  await db.delete(sends).where(eq(sends.id, 10));
  for (const body of ["secret-beta", "edited-beta"]) {
    await db.update(journalEntries).set({ body }).where(eq(journalEntries.id, 20));
    expect((await getJournalForClimb(db, "owner", "owner", 1))[0]).toMatchObject({
      id: 20,
      isAscent: false,
      sent: false,
      body,
    });
    expect((await getJournalForClimb(db, "owner", "stranger", 1))[0]).toMatchObject({
      id: 20,
      body: null,
    });
    expect(
      (await getJournalPage(db, "owner", null, { ...DEFAULT_JOURNAL_FILTER, query: body })).entries,
    ).toEqual([]);
    expect((await getFeedPage(db, "a-friend")).days[0].activities).toMatchObject([
      { id: 20, kind: "session", body: null },
      { id: 21, body: "Session notes" },
      { id: 22, body: "Training notes" },
    ]);
  }
  await db.update(user).set({ sendCommentVisibility: "public" }).where(eq(user.id, "owner"));
  expect((await getJournalForClimb(db, "owner", "stranger", 1))[0].body).toBe("edited-beta");
});
