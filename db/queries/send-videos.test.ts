import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
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
import { getPublicSendsForClimb } from "./public-catalog";
import { getClimbVideos } from "./send-videos";
import { getSendsForClimb, getSendsForUserExportPage, getSendsForUserPage } from "./sends";

const db = createDb(env.DB);
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const SECOND_VIDEO = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
const OWNER_VIDEOS = [VIDEO, SECOND_VIDEO];
const OTHER_VIDEO = "https://www.instagram.com/reel/C9Xq3uGxJ5R/";
const viewers = ["owner", "a-friend", "stranger", null] as const;
const readers: Record<"private" | "friends" | "public" | "everyone", readonly (string | null)[]> = {
  private: ["owner"],
  friends: ["owner", "a-friend"],
  public: ["owner", "a-friend", "stranger"],
  everyone: viewers,
};

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of viewers) if (id) await seedFixtureUser(db, { id, name: id });
  await seedFixtureUser(db, { id: "second", name: "Second Climber" });
  await seedFixtureFriendship(db, "a-friend", "owner");
  // The owner's journal is open to everyone signed in, so every journal read
  // below turns on the send commentary audience alone.
  await db.update(user).set({ journalVisibility: "public" }).where(eq(user.id, "owner"));
  await seedFixtureSend(db, {
    id: 10,
    userId: "owner",
    climbId: 1,
    dateSent: "2026-09-01",
    comment: "beta",
    videos: OWNER_VIDEOS,
  });
  await seedFixtureJournalEntry(db, {
    id: 20,
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-01",
    sent: true,
    isAscent: true,
    body: "beta",
  });
  // A later repeat of the same climb joins the same send row; the video
  // belongs to the ascent entry alone.
  await seedFixtureJournalEntry(db, {
    id: 21,
    userId: "owner",
    climbId: 1,
    entryDate: "2026-09-05",
    sent: true,
    body: "again",
  });
  await seedFixtureSend(db, {
    id: 12,
    userId: "second",
    climbId: 1,
    dateSent: "2026-08-01",
    videos: [OTHER_VIDEO],
  });
  await db.update(user).set({ sendCommentVisibility: "everyone" }).where(eq(user.id, "second"));
});

describe.each(Object.keys(readers) as (keyof typeof readers)[])(
  "videos shared with %s",
  (audience) => {
    beforeEach(async () => {
      await db.update(user).set({ sendCommentVisibility: audience }).where(eq(user.id, "owner"));
    });

    it.each(viewers)("reaches viewer %s only if they may read the commentary", async (viewer) => {
      const expected = readers[audience].includes(viewer) ? OWNER_VIDEOS : null;

      const userSends = await getSendsForUserPage(
        db,
        "owner",
        DEFAULT_USER_SENDS_FILTER,
        0,
        20,
        viewer,
      );
      expect(userSends.sends.map((row) => [row.id, row.videos])).toEqual([[10, expected]]);

      const climbSends = await getSendsForClimb(db, 1, 0, 10, viewer);
      expect(climbSends.sends.map((row) => [row.id, row.videos])).toEqual([
        [10, expected],
        [12, [OTHER_VIDEO]],
      ]);

      // One entry per video, in the climber's order.
      const climbVideos = await getClimbVideos(db, 1, viewer);
      expect(climbVideos).toEqual({
        total: expected ? 3 : 1,
        videos: [
          ...(expected ?? []).map((videoUrl) => ({
            videoUrl,
            userId: viewer === null ? null : "owner",
            userName: "owner",
            userImage: null,
            ascentStyle: "redpoint",
            dateSent: "2026-09-01",
          })),
          {
            videoUrl: OTHER_VIDEO,
            userId: viewer === null ? null : "second",
            userName: "Second Climber",
            userImage: null,
            ascentStyle: "redpoint",
            dateSent: "2026-08-01",
          },
        ],
      });

      if (viewer !== null) {
        const journal = await getJournalPage(db, "owner", viewer, DEFAULT_JOURNAL_FILTER);
        expect(journal.entries.map((entry) => [entry.id, entry.videos])).toEqual([
          [21, null],
          [20, expected],
        ]);
        expect(
          (await getJournalForClimb(db, "owner", viewer, 1)).map((entry) => entry.videos),
        ).toEqual([null, expected]);
      }

      if (viewer === "a-friend") {
        const feed = await getFeedPage(db, viewer);
        const send = feed.days
          .flatMap((day) => day.activities)
          .find((activity) => activity.kind === "send");
        expect(send).toMatchObject({ id: 10, videos: expected });
      }
    });

    it("reaches a signed-out climb page only when shared with everyone", async () => {
      const rows = await getPublicSendsForClimb(db, 1);
      expect(rows.map((row) => [row.userName, row.videos])).toEqual([
        audience === "everyone" ? ["owner", OWNER_VIDEOS] : [null, null],
        ["Second Climber", [OTHER_VIDEO]],
      ]);
    });
  },
);

it("keeps a private profile's videos to its owner, even on its anonymous climb row", async () => {
  await db
    .update(user)
    .set({ isPrivate: true, sendCommentVisibility: "everyone" })
    .where(eq(user.id, "owner"));

  for (const viewer of ["a-friend", "stranger", null]) {
    const climbSends = await getSendsForClimb(db, 1, 0, 10, viewer);
    expect(climbSends.sends[0]).toMatchObject({ id: -1, userId: null, videos: null });
    expect((await getClimbVideos(db, 1, viewer)).videos.map((video) => video.videoUrl)).toEqual([
      OTHER_VIDEO,
    ]);
  }
  expect((await getPublicSendsForClimb(db, 1))[0]).toMatchObject({
    userName: null,
    videos: null,
  });
  expect((await getClimbVideos(db, 1, "owner")).videos.map((video) => video.videoUrl)).toEqual([
    ...OWNER_VIDEOS,
    OTHER_VIDEO,
  ]);
});

it("exports the owner's videos with their sends", async () => {
  await db.update(user).set({ sendCommentVisibility: "private" }).where(eq(user.id, "owner"));
  const page = await getSendsForUserExportPage(db, "owner", null);
  expect(page.sends.map((row) => [row.id, row.videos])).toEqual([[10, OWNER_VIDEOS]]);
});

it("gathers only the newest videos but counts them all", async () => {
  const shown = await getClimbVideos(db, 1, "owner", 2);
  expect(shown.total).toBe(3);
  expect(shown.videos.map((video) => video.videoUrl)).toEqual(OWNER_VIDEOS);
});
