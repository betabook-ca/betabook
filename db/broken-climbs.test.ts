import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { climbs, journalEntries, sends } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

let db: Database;

/** Fixture climb 1 (Test Highball) is marked broken; climb 2 (Test Slab)
 * stays intact so the same statements can be shown to succeed elsewhere. */
const BROKEN = 1;
const INTACT = 2;
const BROKEN_ON = "2026-03-05";

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "break-a" });
  await seedFixtureUser(db, { id: "break-b" });
  await seedFixtureUser(db, { id: "break-c" });
  await seedFixtureUser(db, { id: "break-d" });
  await seedFixtureUser(db, { id: "break-e" });
  await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, BROKEN));
});

/** Drizzle's top-level message is just the failing SQL; the RAISE text and
 * SQLITE_CONSTRAINT_TRIGGER live further down the cause chain. */
async function expectBreakRejection(statement: Promise<unknown>, table: "sends" | "journal") {
  const error = await statement.then(
    () => {
      throw new Error("expected the broken-climb guard to reject this statement");
    },
    (err: unknown) => err,
  );
  const chain: string[] = [];
  for (let cur = error; cur instanceof Error; cur = cur.cause) chain.push(cur.message);
  const joined = chain.join(" | ");
  expect(joined).toMatch(
    table === "sends"
      ? /broken climb: sends must be dated before broken_on/
      : /broken climb: journal entries must be dated before broken_on/,
  );
  expect(joined).toMatch(/SQLITE_CONSTRAINT_TRIGGER/);
}

describe("sends on a broken climb", () => {
  it("accepts a send dated before the break and rejects one on or after it", async () => {
    await db.insert(sends).values({
      userId: "break-a",
      climbId: BROKEN,
      ascentStyle: "redpoint",
      dateSent: "2026-03-04",
    });
    await expectBreakRejection(
      db.insert(sends).values({
        userId: "break-b",
        climbId: BROKEN,
        ascentStyle: "redpoint",
        dateSent: BROKEN_ON,
      }),
      "sends",
    );
    await expectBreakRejection(
      db.insert(sends).values({
        userId: "break-b",
        climbId: BROKEN,
        ascentStyle: "redpoint",
        dateSent: null,
      }),
      "sends",
    );
    const rows = await db.select().from(sends).where(eq(sends.climbId, BROKEN));
    expect(rows.map((r) => r.userId)).toEqual(["break-a"]);
  });

  it("rejects moving a send's date onto or past the break, but allows other edits", async () => {
    await expectBreakRejection(
      db
        .update(sends)
        .set({ dateSent: "2026-06-01" })
        .where(eq(sends.userId, "break-a"))
        .returning(),
      "sends",
    );
    await expectBreakRejection(
      db.update(sends).set({ dateSent: null }).where(eq(sends.userId, "break-a")).returning(),
      "sends",
    );
    await db
      .update(sends)
      .set({ rating: 4, comment: "still fine" })
      .where(eq(sends.userId, "break-a"));
    const row = await db.select().from(sends).where(eq(sends.userId, "break-a")).get();
    expect(row).toMatchObject({ dateSent: "2026-03-04", rating: 4, comment: "still fine" });
  });

  it("leaves a legacy undated send editable, and rejects repointing sends onto the climb", async () => {
    // Existing undated sends predate the break decision; only date/climb changes are guarded.
    await db.insert(sends).values({
      userId: "break-c",
      climbId: INTACT,
      ascentStyle: "flash",
      dateSent: null,
    });
    await db.update(climbs).set({ brokenOn: "2026-01-01" }).where(eq(climbs.id, INTACT));
    await db.update(sends).set({ rating: 5 }).where(eq(sends.userId, "break-c"));
    expect((await db.select().from(sends).where(eq(sends.userId, "break-c")).get())?.rating).toBe(
      5,
    );
    await db.update(climbs).set({ brokenOn: null }).where(eq(climbs.id, INTACT));

    await db.insert(sends).values({
      userId: "break-d",
      climbId: INTACT,
      ascentStyle: "redpoint",
      dateSent: "2026-08-01",
    });
    await expectBreakRejection(
      db.update(sends).set({ climbId: BROKEN }).where(eq(sends.userId, "break-d")).returning(),
      "sends",
    );
  });
});

describe("journal entries on a broken climb", () => {
  it("accepts a session before the break and rejects one on or after it", async () => {
    await db.insert(journalEntries).values({
      userId: "break-e",
      climbId: BROKEN,
      kind: "session",
      sent: false,
      entryDate: "2026-02-01",
    });
    await expectBreakRejection(
      db.insert(journalEntries).values({
        userId: "break-e",
        climbId: BROKEN,
        kind: "session",
        sent: false,
        entryDate: BROKEN_ON,
      }),
      "journal",
    );
    // Training entries carry no climb and are never affected.
    await db.insert(journalEntries).values({
      userId: "break-e",
      climbId: null,
      kind: "training",
      sent: false,
      entryDate: "2026-09-01",
    });
    const rows = await db
      .select({ entryDate: journalEntries.entryDate })
      .from(journalEntries)
      .where(eq(journalEntries.userId, "break-e"));
    expect(rows.map((r) => r.entryDate).sort()).toEqual(["2026-02-01", "2026-09-01"]);
  });

  it("rejects moving an entry's date past the break or repointing an entry onto it", async () => {
    const existing = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.climbId, BROKEN))
      .get();
    expect(existing).toBeDefined();
    await expectBreakRejection(
      db
        .update(journalEntries)
        .set({ entryDate: "2026-04-01" })
        .where(eq(journalEntries.id, existing!.id))
        .returning(),
      "journal",
    );
    await db
      .update(journalEntries)
      .set({ body: "edited body" })
      .where(eq(journalEntries.id, existing!.id));

    const other = await db
      .insert(journalEntries)
      .values({
        userId: "break-e",
        climbId: INTACT,
        kind: "session",
        sent: false,
        entryDate: "2026-07-01",
      })
      .returning({ id: journalEntries.id });
    await expectBreakRejection(
      db
        .update(journalEntries)
        .set({ climbId: BROKEN })
        .where(eq(journalEntries.id, other[0].id))
        .returning(),
      "journal",
    );
  });
});
