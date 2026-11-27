import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { journalEntries, sends } from "@/db/schema";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";

const db = createDb(env.DB);
const USER_ID = "journal-sync-user";
const CLIMB_ID = 1;

beforeAll(async () => {
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: USER_ID, name: "Journal Sync User" });
});

beforeEach(async () => {
  await db.delete(journalEntries).where(eq(journalEntries.userId, USER_ID));
  await db.delete(sends).where(eq(sends.userId, USER_ID));
});

async function expectInvariantViolation(
  query: Promise<unknown>,
  message = "journal/send invariant:",
) {
  const messages: string[] = [];
  try {
    await query;
  } catch (error) {
    for (let current: unknown = error; current instanceof Error; current = current.cause) {
      messages.push(current.message);
    }
  }
  expect(messages.join("\n")).toContain(message);
}

async function seedAscent() {
  await seedFixtureSend(db, {
    userId: USER_ID,
    climbId: CLIMB_ID,
    dateSent: "2026-03-01",
    comment: "Ascent",
  });
  await seedFixtureJournalEntry(db, {
    userId: USER_ID,
    climbId: CLIMB_ID,
    entryDate: "2026-03-01",
    body: "Ascent",
    sent: true,
    isAscent: true,
  });
}

describe("journal and send database invariants", () => {
  it("rejects moving an ascent away from a send that still exists", async () => {
    await seedAscent();
    await seedFixtureSend(db, {
      userId: USER_ID,
      climbId: 2,
      dateSent: "2026-03-01",
      comment: "Ascent",
    });
    const [ascent] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, USER_ID));
    await expectInvariantViolation(
      db.update(journalEntries).set({ climbId: 2 }).where(eq(journalEntries.id, ascent.id)),
    );
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.id, ascent.id)).get(),
    ).toMatchObject({ climbId: CLIMB_ID, isAscent: true });
  });

  it.each([{ body: "Different note" }, { entryDate: "2026-03-02" }])(
    "rolls back an ascent move that no longer mirrors its moved send: %j",
    async (changes) => {
      await seedAscent();
      const [ascent] = await db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.userId, USER_ID));
      await expectInvariantViolation(
        db.batch([
          db.update(sends).set({ climbId: 2 }).where(eq(sends.userId, USER_ID)),
          db
            .update(journalEntries)
            .set({ climbId: 2, ...changes })
            .where(eq(journalEntries.id, ascent.id)),
        ]),
      );
      expect(
        await db.select().from(journalEntries).where(eq(journalEntries.id, ascent.id)).get(),
      ).toEqual(ascent);
      expect(await db.select().from(sends).where(eq(sends.userId, USER_ID))).toMatchObject([
        { climbId: CLIMB_ID, comment: "Ascent", dateSent: "2026-03-01" },
      ]);
    },
  );

  it("rejects a sent entry without a matching dated send", async () => {
    await expectInvariantViolation(
      seedFixtureJournalEntry(db, {
        userId: USER_ID,
        climbId: CLIMB_ID,
        entryDate: "2026-03-01",
        sent: true,
      }),
    );
  });

  it("allows dated repeats of an undated send but rejects a fabricated ascent", async () => {
    await seedFixtureSend(db, { userId: USER_ID, climbId: CLIMB_ID, dateSent: null });
    await seedFixtureJournalEntry(db, {
      userId: USER_ID,
      climbId: CLIMB_ID,
      entryDate: "2026-03-01",
      sent: true,
    });
    await expectInvariantViolation(
      seedFixtureJournalEntry(db, {
        userId: USER_ID,
        climbId: CLIMB_ID,
        entryDate: "2026-03-01",
        sent: true,
        isAscent: true,
      }),
    );
    expect(await db.select().from(sends).where(eq(sends.userId, USER_ID)).get()).toMatchObject({
      dateSent: null,
    });
  });

  it("guards a newly supplied original date against existing repeats", async () => {
    await seedFixtureSend(db, { userId: USER_ID, climbId: CLIMB_ID, dateSent: null });
    await seedFixtureJournalEntry(db, {
      userId: USER_ID,
      climbId: CLIMB_ID,
      entryDate: "2026-03-01",
      sent: true,
    });
    await expectInvariantViolation(
      db.update(sends).set({ dateSent: "2026-04-01" }).where(eq(sends.userId, USER_ID)),
    );
  });

  it("allows only one ascent per user and climb", async () => {
    await seedAscent();
    await expectInvariantViolation(
      seedFixtureJournalEntry(db, {
        userId: USER_ID,
        climbId: CLIMB_ID,
        entryDate: "2026-03-01",
        body: "Ascent",
        sent: true,
        isAscent: true,
      }),
      "UNIQUE constraint",
    );
  });

  it("rejects a repeat before the ascent date", async () => {
    await seedAscent();

    await expectInvariantViolation(
      seedFixtureJournalEntry(db, {
        userId: USER_ID,
        climbId: CLIMB_ID,
        entryDate: "2026-02-28",
        sent: true,
      }),
    );
  });

  it("moves the mirrored entry before updating the send", async () => {
    await seedAscent();
    const ascent = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.userId, USER_ID))
      .get();

    await db.batch([
      db
        .update(journalEntries)
        .set({ entryDate: "2026-02-15", body: "Moved" })
        .where(eq(journalEntries.id, ascent!.id)),
      db
        .update(sends)
        .set({ dateSent: "2026-02-15", comment: "Moved" })
        .where(and(eq(sends.userId, USER_ID), eq(sends.climbId, CLIMB_ID))),
    ]);

    const send = await db.select().from(sends).where(eq(sends.userId, USER_ID)).get();
    expect(send).toMatchObject({ dateSent: "2026-02-15", comment: "Moved" });
  });

  it("rolls back an ascent move past a repeat", async () => {
    await seedAscent();
    await seedFixtureJournalEntry(db, {
      userId: USER_ID,
      climbId: CLIMB_ID,
      entryDate: "2026-04-01",
      body: "Repeat",
      sent: true,
    });
    const ascent = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, USER_ID), eq(journalEntries.entryDate, "2026-03-01")))
      .get();

    await expectInvariantViolation(
      db.batch([
        db
          .update(journalEntries)
          .set({ entryDate: "2026-05-01" })
          .where(eq(journalEntries.id, ascent!.id)),
        db
          .update(sends)
          .set({ dateSent: "2026-05-01" })
          .where(and(eq(sends.userId, USER_ID), eq(sends.climbId, CLIMB_ID))),
      ]),
    );

    const send = await db.select().from(sends).where(eq(sends.userId, USER_ID)).get();
    const entry = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, ascent!.id))
      .get();
    expect(send?.dateSent).toBe("2026-03-01");
    expect(entry?.entryDate).toBe("2026-03-01");
  });

  it("clears sent flags when the corresponding send is deleted", async () => {
    await seedAscent();

    await db.delete(sends).where(and(eq(sends.userId, USER_ID), eq(sends.climbId, CLIMB_ID)));

    const entry = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, USER_ID))
      .get();
    expect(entry).toMatchObject({ sent: false, isAscent: false });
  });
});

describe("0028 reconciliation", () => {
  it("backfills sends created after the original backfill ran", async () => {
    await seedFixtureSend(db, {
      userId: USER_ID,
      climbId: CLIMB_ID,
      dateSent: "2026-06-01",
      comment: "Created between deployments",
    });
    const migration = env.TEST_MIGRATIONS.find((item) =>
      item.name.startsWith("0028_enforce_journal_send_sync"),
    );
    if (!migration) throw new Error("0028_enforce_journal_send_sync.sql is missing");

    await db.run(sql.raw(migration.queries[0]));
    await db.run(sql.raw(migration.queries[0]));

    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, USER_ID));
    expect(entries).toMatchObject([
      {
        climbId: CLIMB_ID,
        entryDate: "2026-06-01",
        body: "Created between deployments",
        sent: true,
      },
    ]);
  });
});

describe("0029 ascent backfill", () => {
  it("marks the original dated ascent while leaving same-day and undated-send repeats alone", async () => {
    await seedFixtureSend(db, { userId: USER_ID, climbId: CLIMB_ID, dateSent: "2026-03-01" });
    for (let i = 0; i < 2; i += 1) {
      await seedFixtureJournalEntry(db, {
        userId: USER_ID,
        climbId: CLIMB_ID,
        entryDate: "2026-03-01",
        sent: true,
      });
    }
    await seedFixtureSend(db, { userId: USER_ID, climbId: 2, dateSent: null });
    await seedFixtureJournalEntry(db, {
      userId: USER_ID,
      climbId: 2,
      entryDate: "2026-03-01",
      sent: true,
    });
    const migration = env.TEST_MIGRATIONS.find((item) =>
      item.name.startsWith("0029_explicit_journal_ascents"),
    );
    const backfill = migration?.queries.find((query) =>
      query.includes("UPDATE journal_entries AS j"),
    );
    if (!backfill) throw new Error("0029 ascent backfill is missing");
    // The deployment runs this before installing the new write guards.
    await db.run(sql`DROP TRIGGER journal_sent_update_guard`);
    await db.run(sql.raw(backfill));
    const updateGuard = migration!.queries.find((query) =>
      query.includes("CREATE TRIGGER journal_sent_update_guard"),
    )!;
    await db.run(sql.raw(updateGuard));
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, USER_ID))
      .orderBy(journalEntries.id);
    expect(entries.map((entry) => entry.isAscent)).toEqual([true, false, false]);
  });
});
