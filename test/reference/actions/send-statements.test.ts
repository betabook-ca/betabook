import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildSentJournalInsert,
  journalEntryFromSend,
  rethrowJournalSendInvariant,
} from "@/actions/journal-sync";
import { buildMirroredSendUpdate, buildSendInsert } from "@/actions/send-statements";
import { createDb, type Database } from "@/db/client";
import { journalEntries, sends } from "@/db/schema";
import type { SendInput } from "@/lib/sends";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";

let db: Database;

const HIGHBALL = 1; // boulder
const CRIMPER = 3; // sport

const INPUT: SendInput = {
  ascentStyle: "redpoint",
  dateSent: "2026-03-01",
  comment: null,
  rating: 4,
  suggestedGrade: 5,
  gradeFeel: "solid",
};

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "stmt-user", name: "Statement User" });
  await seedFixtureUser(db, { id: "guard-user", name: "Guard User" });
  // Test the statement guards independently of the migrated journal-sync triggers.
  for (const trigger of [
    "journal_sent_insert_guard",
    "journal_sent_update_guard",
    "send_journal_update_guard",
    "send_journal_delete_sync",
  ]) {
    await db.run(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`));
  }
});

describe("buildSendInsert", () => {
  it("refuses to write against a climb of a different discipline", async () => {
    const messages: string[] = [];
    try {
      await buildSendInsert(db, {
        userId: "stmt-user",
        climbId: CRIMPER,
        climbType: "boulder", // stale: CRIMPER is a sport route
        input: INPUT,
      });
    } catch (error) {
      for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
    }
    expect(messages.join("\n")).toContain("NOT NULL constraint failed: sends.climb_id");
    expect(await db.select().from(sends).where(eq(sends.climbId, CRIMPER)).get()).toBeUndefined();
  });

  it("can ride in a db.batch, and takes the batch down with it when guarded", async () => {
    await db.batch([
      db.insert(journalEntries).values({
        userId: "stmt-user",
        climbId: CRIMPER,
        kind: "session",
        entryDate: "2026-03-02",
      }),
      buildSendInsert(db, {
        userId: "stmt-user",
        climbId: CRIMPER,
        climbType: "sport",
        input: { ...INPUT, suggestedGrade: 10 },
      }),
    ]);
    expect(await db.select().from(sends).where(eq(sends.climbId, CRIMPER)).get()).toBeDefined();

    const before = await db.select().from(journalEntries);
    await expect(
      db.batch([
        db.insert(journalEntries).values({
          userId: "stmt-user",
          climbId: 4,
          kind: "session",
          entryDate: "2026-03-03",
        }),
        buildSendInsert(db, {
          userId: "stmt-user",
          climbId: 4, // Test Crack, a trad route
          climbType: "boulder",
          input: INPUT,
        }),
      ]),
    ).rejects.toThrow(/NOT NULL constraint failed/);

    expect(await db.select().from(journalEntries)).toHaveLength(before.length);
  });
});

describe("journal synchronization statements", () => {
  it("rejects a sent entry if its send was concurrently deleted", async () => {
    await seedFixtureSend(db, {
      userId: "guard-user",
      climbId: HIGHBALL,
      dateSent: "2026-03-01",
    });
    await db.delete(sends).where(and(eq(sends.userId, "guard-user"), eq(sends.climbId, HIGHBALL)));

    let caught: unknown;
    try {
      await buildSentJournalInsert(
        db,
        journalEntryFromSend("guard-user", HIGHBALL, "2026-04-01", null),
      );
    } catch (error) {
      caught = error;
    }

    expect(() => rethrowJournalSendInvariant(caught, "Guarded journal write")).toThrow(
      "Guarded journal write",
    );
    expect(
      await db
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.userId, "guard-user"), eq(journalEntries.climbId, HIGHBALL))),
    ).toEqual([]);
  });

  it("rejects an ascent move based on a stale repeat read", async () => {
    await seedFixtureSend(db, {
      userId: "guard-user",
      climbId: CRIMPER,
      dateSent: "2026-03-01",
      comment: "Ascent",
    });
    await seedFixtureJournalEntry(db, {
      userId: "guard-user",
      climbId: CRIMPER,
      entryDate: "2026-03-01",
      body: "Ascent",
      sent: true,
      isAscent: true,
    });
    const ascent = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.userId, "guard-user"), eq(journalEntries.climbId, CRIMPER)))
      .get();
    await seedFixtureJournalEntry(db, {
      userId: "guard-user",
      climbId: CRIMPER,
      entryDate: "2026-04-01",
      sent: true,
    });

    let caught: unknown;
    try {
      await buildMirroredSendUpdate(db, {
        userId: "guard-user",
        climbId: CRIMPER,
        values: { dateSent: "2026-05-01", comment: "Moved" },
        ascentEntryId: ascent!.id,
      });
    } catch (error) {
      caught = error;
    }

    expect(() => rethrowJournalSendInvariant(caught, "Guarded send write")).toThrow(
      "Guarded send write",
    );
    expect(
      await db
        .select({ dateSent: sends.dateSent })
        .from(sends)
        .where(and(eq(sends.userId, "guard-user"), eq(sends.climbId, CRIMPER)))
        .get(),
    ).toEqual({ dateSent: "2026-03-01" });
  });
});
