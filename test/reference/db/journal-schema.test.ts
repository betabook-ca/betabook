import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { journalEntries, sends, user } from "@/db/schema";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

let db: Database;

const CLIMB = 1; // Test Highball, from seedFixtureTree

beforeEach(async () => {
  db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "journal-user", name: "Journal User" });
});

function insert(row: Partial<typeof journalEntries.$inferInsert> & { entryDate: string }) {
  return seedFixtureJournalEntry(db, { userId: "journal-user", ...row });
}

async function expectCheckViolation(query: Promise<unknown>, constraint: string) {
  const messages: string[] = [];
  try {
    await query;
  } catch (error) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
  }
  expect(messages.join("\n")).toContain(`CHECK constraint failed: ${constraint}`);
}

describe("journal_entries CHECK constraints", () => {
  it("accepts the three legal shapes", async () => {
    await insert({ entryDate: "2026-03-03", climbId: CLIMB }); // session, working a climb
    await seedFixtureSend(db, {
      userId: "journal-user",
      climbId: CLIMB,
      dateSent: "2026-03-04",
    });
    await insert({ entryDate: "2026-03-04", climbId: CLIMB, sent: true }); // sent
    await insert({ entryDate: "2026-03-05", kind: "training", body: "Hangboard" });

    const rows = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "journal-user"));
    expect(rows).toHaveLength(3);
  });

  it("rejects an unknown kind", async () => {
    await expectCheckViolation(
      db.run(sql`
        INSERT INTO journal_entries (user_id, kind, entry_date)
        VALUES ('journal-user', 'projecting', '2026-03-06')
      `),
      "journal_kind_valid",
    );
  });

  it("rejects sent without a climb", async () => {
    await expectCheckViolation(
      insert({ entryDate: "2026-03-07", climbId: null, sent: true }),
      "journal_sent_needs_climb",
    );
  });

  it("rejects an outdoor session without a climb", async () => {
    await expectCheckViolation(
      insert({ entryDate: "2026-03-11", climbId: null }),
      "journal_session_needs_climb",
    );
  });

  it("rejects a training entry against a climb", async () => {
    await expectCheckViolation(
      insert({ entryDate: "2026-03-08", kind: "training", climbId: CLIMB }),
      "journal_training_shape",
    );
  });

  it("rejects a sent training entry", async () => {
    await expectCheckViolation(
      db.run(sql`
        INSERT INTO journal_entries (user_id, climb_id, kind, sent, entry_date)
        VALUES ('journal-user', ${CLIMB}, 'training', 1, '2026-03-09')
      `),
      "journal_training_shape",
    );
  });

  it("rejects a non-boolean sent", async () => {
    await expectCheckViolation(
      db.run(sql`
        INSERT INTO journal_entries (user_id, climb_id, kind, sent, entry_date)
        VALUES ('journal-user', ${CLIMB}, 'session', 2, '2026-03-10')
      `),
      "journal_sent_boolean",
    );
  });
});

describe("journal_entries cascade from user", () => {
  it("deletes a user's entries with the user", async () => {
    await seedFixtureUser(db, { id: "cascade-user", name: "Cascade User" });
    await seedFixtureJournalEntry(db, {
      userId: "cascade-user",
      climbId: CLIMB,
      entryDate: "2026-04-01",
    });

    await db.delete(user).where(eq(user.id, "cascade-user"));

    const remaining = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "cascade-user"));
    expect(remaining).toEqual([]);
  });
});

describe("journal_entries indexes", () => {
  it("indexes climb foreign-key lookups", async () => {
    const indexes = await db.all<{ name: string }>(sql`PRAGMA index_list('journal_entries')`);
    expect(indexes.map(({ name }) => name)).toContain("journal_climb_idx");
  });
});

async function runBackfill() {
  const migration = env.TEST_MIGRATIONS.find((m) =>
    m.name.startsWith("0027_backfill_journal_sessions"),
  );
  if (!migration) throw new Error("0027_backfill_journal_sessions.sql is missing");
  for (const query of migration.queries) await db.run(sql.raw(query));
}

describe("0027 backfill", () => {
  beforeEach(async () => {
    await seedFixtureUser(db, { id: "backfill-user", name: "Backfill User" });
    await seedFixtureSend(db, {
      userId: "backfill-user",
      climbId: 3,
      dateSent: "2025-06-01",
      comment: "x".repeat(1200),
      createdAt: new Date("2025-06-01T10:00:00.000Z"),
      updatedAt: new Date("2025-06-02T11:30:00.000Z"),
    });
    await seedFixtureSend(db, { userId: "backfill-user", climbId: 4, dateSent: null });
  });

  it("gives every dated send a sent session, and skips undated ones", async () => {
    await runBackfill();

    const rows = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "backfill-user"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      climbId: 3,
      kind: "session",
      sent: true,
      entryDate: "2025-06-01",
      body: "x".repeat(1200),
      createdAt: new Date("2025-06-01T10:00:00.000Z"),
      updatedAt: new Date("2025-06-02T11:30:00.000Z"),
    });

    const send = await db.select().from(sends).where(eq(sends.climbId, 3)).get();
    expect(send?.comment).toBe("x".repeat(1200));
  });

  it("is a no-op on re-application", async () => {
    await runBackfill();
    const before = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "backfill-user"));
    expect(before).toHaveLength(1);
    await runBackfill();
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.userId, "backfill-user")),
    ).toEqual(before);

    const rows = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "backfill-user"));
    expect(rows).toHaveLength(1);
  });
});
