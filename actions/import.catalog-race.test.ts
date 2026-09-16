import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { importSends } from "@/actions/import";
import { createDb } from "@/db/client";
import { climbs, importBatches, journalEntries, sends } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const race = vi.hoisted(() => ({ beforeBatch: undefined as (() => Promise<void>) | undefined }));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("@/lib/session", () => ({ requireSession: async () => ({ user: { id: "importer" } }) }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => {
      const db = actual.createDb(env.DB);
      const batch = db.batch.bind(db);
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
beforeEach(async () => {
  race.beforeBatch = undefined;
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "importer" });
});

it.each([
  { climbId: 1, gradeText: "V5", nextType: "sport" as const, nextGrade: 20 },
  { climbId: 3, gradeText: "5.12a", nextType: "boulder" as const, nextGrade: 5 },
])(
  "rejects an import normalized before climb $climbId changed to $nextType, and can retry safely",
  async ({ climbId, gradeText, nextType, nextGrade }) => {
    const options = { onConflict: "skip", gradeScale: "native", batchId: "catalog-race" } as const;
    const rows = [2, climbId].map((id) => ({
      climbId: id,
      ascentStyle: "redpoint" as const,
      dateSent: "2026-09-01",
      rating: 4,
      comment: "Imported note",
      gradeText: id === climbId ? gradeText : "V3",
      blankGradeMeans: "posted-grade" as const,
      gradeFeel: "solid" as const,
    }));
    race.beforeBatch = async () => {
      await db
        .update(climbs)
        .set({ type: nextType, grade: nextGrade })
        .where(eq(climbs.id, climbId));
    };

    expect(await importSends(rows, options)).toMatchObject({ ok: false });
    expect(await db.select().from(sends)).toEqual([]);
    expect(await db.select().from(journalEntries)).toEqual([]);
    expect(await db.select().from(importBatches)).toEqual([]);
    expect(await db.select().from(climbs).where(eq(climbs.id, climbId)).get()).toMatchObject({
      type: nextType,
      grade: nextGrade,
      sendCount: 0,
    });

    expect(await importSends(rows, options)).toMatchObject({ ok: true, value: { imported: 2 } });
    expect(await db.select().from(sends).where(eq(sends.climbId, climbId)).get()).toMatchObject({
      suggestedGrade: null,
      comment: "Imported note",
    });
    expect(await db.select().from(journalEntries)).toHaveLength(2);
  },
);

it.each([null, "2026-09-01"])(
  "rolls back an overwrite with date %s when its replacement send uses another discipline",
  async (dateSent) => {
    await seedFixtureSend(db, { userId: "importer", climbId: 1, dateSent: null });
    let replacement: Awaited<ReturnType<typeof readSends>> = [];
    race.beforeBatch = async () => {
      await db.delete(sends).where(eq(sends.climbId, 1));
      await db.update(climbs).set({ type: "sport", grade: 20 }).where(eq(climbs.id, 1));
      await seedFixtureSend(db, {
        userId: "importer",
        climbId: 1,
        dateSent: null,
        comment: "Replacement send",
        rating: 5,
        suggestedGrade: 20,
      });
      replacement = await readSends();
    };
    const rows = [2, 1].map((climbId) => ({
      climbId,
      ascentStyle: "redpoint" as const,
      dateSent,
      rating: 4,
      comment: "Stale import",
      gradeText: "V5",
      blankGradeMeans: "posted-grade" as const,
      gradeFeel: "solid" as const,
    }));

    expect(
      await importSends(rows, {
        onConflict: "overwrite",
        gradeScale: "native",
        batchId: "overwrite-catalog-race",
      }),
    ).toMatchObject({ ok: false });
    expect(replacement).toHaveLength(1);
    expect(await readSends()).toEqual(replacement);
    expect(await db.select().from(journalEntries)).toEqual([]);
    expect(await db.select().from(importBatches)).toEqual([]);
    expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toMatchObject({
      type: "sport",
      sendCount: 1,
      ratingSum: 5,
    });
    expect(await db.select().from(climbs).where(eq(climbs.id, 2)).get()).toMatchObject({
      sendCount: 0,
      ratingSum: 0,
    });
  },
);

function readSends() {
  return db.select().from(sends).orderBy(sends.id);
}
