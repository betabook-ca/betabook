import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { getClimberOverview, type ClimberOverview } from "@/db/queries/climber-overview";
import { user } from "@/db/schema";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const TODAY = "2026-03-06";

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  for (const [id, name] of [
    ["owner", "Owner"],
    ["friend", "Friend"],
    ["requester", "Requester"],
    ["stranger", "Stranger"],
  ]) {
    await seedFixtureUser(db, { id, name });
  }
  await db.update(user).set({ journalVisibility: "friends" }).where(eq(user.id, "owner"));
  await seedFixtureFriendship(db, "owner", "friend");
  await seedFixtureFriendship(db, "requester", "owner", "pending");

  await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-03-02" });
  await seedFixtureSend(db, { userId: "owner", climbId: 2, dateSent: null });
  await seedFixtureSend(db, { userId: "owner", climbId: 3, dateSent: "2025-06-10" });
  await seedFixtureSend(db, { userId: "owner", climbId: 4, dateSent: "2026-03-04" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 1, entryDate: "2026-03-02" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 3, entryDate: "2026-03-03" });
  await seedFixtureJournalEntry(db, { userId: "owner", kind: "training", entryDate: "2026-03-05" });
  await seedFixtureJournalEntry(db, { userId: "owner", climbId: 2, entryDate: "2024-01-15" });
  await seedFixtureSend(db, { userId: "stranger", climbId: 3, dateSent: "2026-03-05" });
});

const seasonTotal = (overview: ClimberOverview) =>
  overview.season.reduce((sum, week) => sum + week.days, 0);

const SEND_FACTS = {
  sendCount: 4,
  areaCount: 3,
  hardest: [
    { type: "boulder", grade: "V4", sendCount: 2 },
    { type: "sport", grade: "5.10a", sendCount: 1 },
    { type: "trad", grade: "5.6", sendCount: 1 },
  ],
};

describe("getClimberOverview", () => {
  it.each(["owner", "friend"])("reads the journal's days out for %s", async (viewerId) => {
    const overview = await getClimberOverview(db, "owner", viewerId, TODAY);

    expect(overview).toMatchObject({ ...SEND_FACTS, firstYear: 2024, daysOut: 3 });
    expect(overview.season).toHaveLength(52);
    expect(overview.season.at(-1)).toEqual({ start: "2026-03-02", days: 2 });
    expect(seasonTotal(overview)).toBe(2);
  });

  it.each(["requester", "stranger"])(
    "falls back to sending days for %s, who cannot read the journal",
    async (viewerId) => {
      const overview = await getClimberOverview(db, "owner", viewerId, TODAY);

      expect(overview).toMatchObject({ ...SEND_FACTS, firstYear: 2025, daysOut: null });
      expect(overview.season.at(-1)).toEqual({ start: "2026-03-02", days: 2 });
      expect(seasonTotal(overview)).toBe(3);
    },
  );

  it("stops reading the journal as soon as its audience narrows", async () => {
    await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "owner"));

    const friendView = await getClimberOverview(db, "owner", "friend", TODAY);
    const ownerView = await getClimberOverview(db, "owner", "owner", TODAY);

    expect(friendView).toMatchObject({ daysOut: null, firstYear: 2025 });
    expect(seasonTotal(friendView)).toBe(3);
    expect(ownerView).toMatchObject({ daysOut: 3, firstYear: 2024 });
  });

  it("tells an empty but readable journal from a hidden one", async () => {
    const overview = await getClimberOverview(db, "friend", "owner", TODAY);

    expect(overview).toMatchObject({
      sendCount: 0,
      areaCount: 0,
      hardest: [],
      firstYear: null,
      daysOut: 0,
    });
    expect(seasonTotal(overview)).toBe(0);
  });
});
