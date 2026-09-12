import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser, seedManyUsers } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getPublicSendsForClimb } from "./public-catalog";

const db = createDb(env.DB);

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
});

it("names only Everyone commentary and keeps every other send to its month", async () => {
  await seedFixtureUser(db, {
    id: "open",
    name: "Open Climber",
    sendCommentVisibility: "everyone",
  });
  await seedFixtureUser(db, {
    id: "member",
    name: "Member Climber",
    sendCommentVisibility: "public",
  });
  await seedFixtureUser(db, {
    id: "friend",
    name: "Friend Climber",
    sendCommentVisibility: "friends",
  });
  await seedFixtureUser(db, {
    id: "quiet",
    name: "Quiet Climber",
    sendCommentVisibility: "private",
  });
  await seedFixtureSend(db, {
    id: 1,
    userId: "open",
    climbId: 1,
    dateSent: "2026-09-03",
    ascentStyle: "flash",
    rating: 5,
    suggestedGrade: 6,
    gradeFeel: "high",
    comment: "Open beta",
  });
  await seedFixtureSend(db, {
    id: 2,
    userId: "member",
    climbId: 1,
    dateSent: "2026-08-14",
    rating: 4,
    suggestedGrade: 5,
    comment: "Member beta",
  });
  await seedFixtureSend(db, {
    id: 3,
    userId: "friend",
    climbId: 1,
    dateSent: "2026-07-02",
    ascentStyle: "onsight",
    gradeFeel: "low",
    comment: "Friend beta",
  });
  await seedFixtureSend(db, {
    id: 4,
    userId: "quiet",
    climbId: 1,
    dateSent: null,
    rating: 2,
    comment: "Quiet beta",
  });
  await seedFixtureSend(db, { id: 5, userId: "member", climbId: 2, dateSent: "2026-09-10" });

  expect(await getPublicSendsForClimb(db, 1)).toEqual([
    {
      userName: "Open Climber",
      dateSent: "2026-09-03",
      ascentStyle: "flash",
      rating: 5,
      suggestedGrade: 6,
      gradeFeel: "high",
      comment: "Open beta",
    },
    {
      userName: null,
      dateSent: "2026-08",
      ascentStyle: "redpoint",
      rating: 4,
      suggestedGrade: 5,
      gradeFeel: "solid",
      comment: null,
    },
    {
      userName: null,
      dateSent: "2026-07",
      ascentStyle: "onsight",
      rating: null,
      suggestedGrade: null,
      gradeFeel: "low",
      comment: null,
    },
    {
      userName: null,
      dateSent: null,
      ascentStyle: "redpoint",
      rating: 2,
      suggestedGrade: null,
      gradeFeel: "solid",
      comment: null,
    },
  ]);
});

it("reads current audiences and keeps private profiles anonymous", async () => {
  await seedFixtureUser(db, {
    id: "open",
    name: "Open Climber",
    sendCommentVisibility: "everyone",
  });
  await seedFixtureUser(db, { id: "member", name: "Member Climber" });
  await seedFixtureSend(db, {
    userId: "open",
    climbId: 1,
    dateSent: "2026-09-03",
    comment: "Open beta",
  });
  await seedFixtureSend(db, {
    userId: "member",
    climbId: 1,
    dateSent: "2026-08-14",
    comment: "Member beta",
  });
  const rows = async () =>
    (await getPublicSendsForClimb(db, 1)).map((send) => [
      send.userName,
      send.dateSent,
      send.comment,
    ]);

  expect(await rows()).toEqual([
    ["Open Climber", "2026-09-03", "Open beta"],
    [null, "2026-08", null],
  ]);
  await db.update(user).set({ sendCommentVisibility: "public" }).where(eq(user.id, "open"));
  await db.update(user).set({ sendCommentVisibility: "everyone" }).where(eq(user.id, "member"));
  expect(await rows()).toEqual([
    [null, "2026-09", null],
    ["Member Climber", "2026-08-14", "Member beta"],
  ]);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "member"));
  expect(await rows()).toEqual([
    [null, "2026-09", null],
    [null, "2026-08", null],
  ]);
});

it("returns the latest sends newest first with ID tie-breaks, capped", async () => {
  const count = 12;
  await seedManyUsers(
    db,
    Array.from({ length: count }, (_, i) => ({ id: `climber-${i}` })),
  );
  for (let i = 0; i < count; i += 1) {
    await seedFixtureSend(db, {
      id: i + 1,
      userId: `climber-${i}`,
      climbId: 1,
      dateSent: i === 0 ? null : `2026-01-${String(Math.min(i, 10)).padStart(2, "0")}`,
      suggestedGrade: i,
    });
  }
  expect((await getPublicSendsForClimb(db, 1)).map((send) => send.suggestedGrade)).toEqual([
    10, 11, 9, 8, 7, 6, 5, 4, 3, 2,
  ]);
});
