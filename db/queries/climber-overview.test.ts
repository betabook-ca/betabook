import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { getClimberHardest, getClimberOverview } from "@/db/queries/climber-overview";
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

const SEND_FACTS = { sendCount: 4, areaCount: 3 };

describe("getClimberHardest", () => {
  it("lists each graded discipline's hardest send, most-sent first", async () => {
    expect(await getClimberHardest(db, "owner")).toEqual([
      { type: "boulder", grade: "V4" },
      { type: "sport", grade: "5.10a" },
      { type: "trad", grade: "5.6" },
    ]);
  });

  it("is empty before anything is sent", async () => {
    expect(await getClimberHardest(db, "friend")).toEqual([]);
  });
});

describe("getClimberOverview", () => {
  it.each(["owner", "friend"])("reads days out from the journal for %s", async (viewerId) => {
    const overview = await getClimberOverview(db, "owner", viewerId, TODAY);

    expect(overview).toEqual({
      ...SEND_FACTS,
      firstYear: 2024,
      daysOut: 3,
      lastOut: "2026-03-03",
      daysThisMonth: 2,
      month: "2026-03",
    });
  });

  it.each(["requester", "stranger"])(
    "falls back to sending days for %s, who cannot read the journal",
    async (viewerId) => {
      const overview = await getClimberOverview(db, "owner", viewerId, TODAY);

      expect(overview).toEqual({
        ...SEND_FACTS,
        firstYear: 2025,
        daysOut: null,
        lastOut: "2026-03-04",
        daysThisMonth: 2,
        month: "2026-03",
      });
    },
  );

  it("stops reading the journal as soon as its audience narrows", async () => {
    await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, "owner"));

    const friendView = await getClimberOverview(db, "owner", "friend", TODAY);
    const ownerView = await getClimberOverview(db, "owner", "owner", TODAY);

    expect(friendView).toMatchObject({ daysOut: null, firstYear: 2025, lastOut: "2026-03-04" });
    expect(ownerView).toMatchObject({ daysOut: 3, firstYear: 2024, lastOut: "2026-03-03" });
  });

  it("tells an empty but readable journal from a hidden one", async () => {
    const overview = await getClimberOverview(db, "friend", "owner", TODAY);

    expect(overview).toMatchObject({
      sendCount: 0,
      areaCount: 0,
      firstYear: null,
      daysOut: 0,
      lastOut: null,
      daysThisMonth: 0,
    });
  });
});
