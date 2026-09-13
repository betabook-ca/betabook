import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createJournalEntry, deleteJournalEntry, updateJournalEntry, updateSend } from "@/actions";
import { buildJournalEntryGuard } from "@/actions/journal-sync";
import { applyClimbMerge } from "@/actions/moderation-apply";
import { createDb } from "@/db/client";
import * as queries from "@/db/queries";
import { climbs, journalCompanions, journalEntries, sends } from "@/db/schema";
import { seedFixtureFriendship, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const race = vi.hoisted(() => ({ beforeBatch: undefined as (() => Promise<void>) | undefined }));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: "author" } }),
}));
vi.mock("@/lib/rate-limit", () => ({ allowJournalWrite: async () => true }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => {
      const db = actual.createDb(env.DB);
      const batch = db.batch.bind(db);
      // Interleave a real committed merge after action reads and before its real D1 batch.
      db.batch = async (statements) => {
        const beforeBatch = race.beforeBatch;
        race.beforeBatch = undefined;
        await beforeBatch?.();
        return batch(statements);
      };
      return db;
    },
  };
});

const db = createDb(env.DB);

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    kind: "session",
    climbId: "1",
    sent: "true",
    entryDate: "2026-09-01",
    dateSent: "2026-09-01",
    body: "Original note",
    comment: "Original note",
    ascentStyle: "redpoint",
    rating: "4",
    suggestedGrade: "5",
    companionsChanged: "true",
    ...overrides,
  }))
    data.set(key, value);
  return data;
}

async function snapshot() {
  return {
    entries: await db.select().from(journalEntries).orderBy(journalEntries.id),
    sends: await db.select().from(sends).orderBy(sends.id),
    companions: await db
      .select()
      .from(journalCompanions)
      .orderBy(journalCompanions.entryId, journalCompanions.userId),
    climbs: await db.select().from(climbs).orderBy(climbs.id),
  };
}

beforeEach(async () => {
  race.beforeBatch = undefined;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "author" });
  await seedFixtureUser(db, { id: "partner" });
  await seedFixtureFriendship(db, "author", "partner");
  const data = form();
  data.append("companion", "partner");
  const result = await createJournalEntry(data);
  if (!result.ok) throw new Error(`Failed to seed tagged ascent: ${result.error}`);
});

const operations = ["edit entry", "delete entry", "edit send"] as const;

it.each(
  operations.flatMap((operation) => [false, true].map((collision) => ({ operation, collision }))),
)(
  "rejects $operation after a merge (destination send: $collision), preserving the entire merged state",
  async ({ operation, collision }) => {
    const [entry] = await db.select().from(journalEntries);
    const [send] = await db.select().from(sends);
    if (collision)
      expect((await createJournalEntry(form({ climbId: "2", body: "Destination note" }))).ok).toBe(
        true,
      );

    let merged: Awaited<ReturnType<typeof snapshot>> | undefined;
    race.beforeBatch = async () => {
      await applyClimbMerge(db, 1, 2);
      merged = await snapshot();
    };
    const changes = form({ body: "Stale edit", comment: "Stale edit", rating: "5" });
    const result =
      operation === "edit entry"
        ? await updateJournalEntry(entry.id, changes)
        : operation === "delete entry"
          ? await deleteJournalEntry(entry.id)
          : await updateSend(send.id, changes);

    expect(merged?.entries.find((row) => row.id === entry.id)).toMatchObject({
      climbId: 2,
      body: "Original note",
      isAscent: !collision,
    });
    expect(merged?.companions).toMatchObject([{ entryId: entry.id, userId: "partner" }]);
    expect(result).toEqual({
      ok: false,
      error:
        operation === "edit send"
          ? "The journal changed while this send was being saved — try again"
          : "The entry changed — refresh and try again",
    });
    expect(await snapshot()).toEqual(merged);

    // A refreshed editor can still save against the retained entry at its new climb.
    const retry = form({ climbId: "2", sent: String(!collision), body: "Fresh edit" });
    expect((await updateJournalEntry(entry.id, retry)).ok).toBe(true);
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.id, entry.id)).get(),
    ).toMatchObject({
      climbId: 2,
      body: "Fresh edit",
    });
    expect(await db.select().from(sends)).toMatchObject([
      { climbId: 2, comment: collision ? "Destination note" : "Fresh edit" },
    ]);
  },
);

it.each(["edit entry", "delete entry"] as const)(
  "rejects %s when the merge commits immediately after the entry read",
  async (operation) => {
    const [entry] = await db.select().from(journalEntries);
    const getJournalEntry = queries.getJournalEntry;
    let merged: Awaited<ReturnType<typeof snapshot>> | undefined;
    const spy = vi.spyOn(queries, "getJournalEntry").mockImplementationOnce(async (...args) => {
      const existing = await getJournalEntry(...args);
      await applyClimbMerge(db, 1, 2);
      merged = await snapshot();
      return existing;
    });
    try {
      const result =
        operation === "edit entry"
          ? await updateJournalEntry(entry.id, form({ body: "Stale edit" }))
          : await deleteJournalEntry(entry.id);
      expect(result).toEqual({ ok: false, error: "The entry changed — refresh and try again" });
      expect(merged?.entries).toMatchObject([{ id: entry.id, climbId: 2, isAscent: true }]);
      expect(await snapshot()).toEqual(merged);
    } finally {
      spy.mockRestore();
    }
  },
);

it("checks only the target entry without writing rows, regardless of unrelated journal history", async () => {
  const [entry] = await db.select().from(journalEntries);
  const statement = buildJournalEntryGuard(db, entry).toSQL();
  const runGuard = () =>
    env.DB.prepare(statement.sql)
      .bind(...statement.params)
      .run();
  const before = await runGuard();

  await db.run(sql`
    WITH RECURSIVE entries(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM entries WHERE n < 200)
    INSERT INTO journal_entries (user_id, kind, entry_date)
    SELECT 'author', 'training', '2026-09-01' FROM entries
  `);
  const unchanged = await snapshot();
  expect(unchanged.entries).toHaveLength(201);
  const after = await runGuard();
  expect(before.meta).toMatchObject({ rows_read: 1, rows_written: 0, changes: 0 });
  expect(after.meta).toMatchObject({ rows_read: 1, rows_written: 0, changes: 0 });
  expect(await snapshot()).toEqual(unchanged);
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .bind(...statement.params)
    .all<{ detail: string }>();
  expect(plan.results).toContainEqual(
    expect.objectContaining({
      detail: "SEARCH journal_entries USING INTEGER PRIMARY KEY (rowid=?)",
    }),
  );
});
