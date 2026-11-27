import { env } from "cloudflare:test";
import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { importSends } from "@/actions/import";
import { createDb } from "@/db/client";
import { importBatches, sends } from "@/db/schema";
import { runImportBatches } from "@/lib/import-execution";
import { seedFixtureTree, seedFixtureUser, seedManyClimbs } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const state = vi.hoisted(() => ({
  id: "requester",
  role: null as string | null,
  failRefresh: false,
}));
vi.mock("next/cache", () => ({
  refresh: () => {
    if (state.failRefresh) throw new Error("audit cache failure after commit");
  },
  revalidatePath: () => {},
}));
vi.mock("@/lib/email", () => ({ sendChangeRequestDecisionEmail: async () => {} }));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: state.id, role: state.role } }),
  requireAdmin: async () => ({ user: { id: state.id, role: state.role } }),
  isAdmin: (session: { user: { role?: string | null } }) => session.user.role === "admin",
}));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "requester" });
  await seedFixtureUser(db, { id: "reviewer", role: "admin" });
  state.id = "requester";
  state.role = null;
  state.failRefresh = false;
});

function importRow(climbId: number, comment: string) {
  return {
    climbId,
    comment,
    ascentStyle: "redpoint" as const,
    dateSent: null,
    rating: 4,
    gradeText: null,
    gradeFeel: "solid" as const,
  };
}

it("does not report a committed import as a failed batch when refresh fails", async () => {
  state.failRefresh = true;
  const result = await importSends([importRow(1, "Committed")], {
    gradeScale: "native",
    onConflict: "skip",
  });
  expect((await db.select().from(sends).where(eq(sends.climbId, 1)).get())!.comment).toBe(
    "Committed",
  );
  expect(result.ok).toBe(true);
});

it("deduplicates the whole file before sending overwrite batches", async () => {
  await seedManyClimbs(db, 5, 49, 100);
  const rows = [
    importRow(1, "First"),
    ...Array.from({ length: 49 }, (_, i) => importRow(100 + i, "Filler")),
    importRow(1, "Later"),
  ];
  const result = await runImportBatches(rows, (batch) =>
    importSends(batch, { gradeScale: "native", onConflict: "overwrite" }),
  );
  expect((await db.select().from(sends).where(eq(sends.climbId, 1)).get())!.comment).toBe("First");
  expect(result).toMatchObject({ imported: 50, overwritten: 0, duplicates: [50] });
});

it("replays a batch receipt without overwriting a later user edit", async () => {
  const options = {
    gradeScale: "native" as const,
    onConflict: "overwrite" as const,
    batchId: "batch-replay",
  };
  const original = await importSends([importRow(1, "Original")], options);
  expect(original).toMatchObject({ ok: true, value: { imported: 1 } });
  await db.update(sends).set({ comment: "Later user edit" }).where(eq(sends.climbId, 1));
  expect(await importSends([importRow(1, "Original")], options)).toEqual(original);
  expect((await db.select().from(sends).where(eq(sends.climbId, 1)).get())!.comment).toBe(
    "Later user edit",
  );
});

it("rejects reuse of a batch id with different rows", async () => {
  const options = {
    gradeScale: "native" as const,
    onConflict: "overwrite" as const,
    batchId: "batch-reuse",
  };
  expect((await importSends([importRow(1, "Original")], options)).ok).toBe(true);
  expect((await importSends([importRow(1, "Different")], options)).ok).toBe(false);
  expect((await db.select().from(sends).where(eq(sends.climbId, 1)).get())!.comment).toBe(
    "Original",
  );
});

it("stops on an unconfirmed response and separates it from a rejected batch", async () => {
  const send = vi.fn<() => Promise<never>>(async () => {
    throw new Error("Connection lost");
  });
  const result = await runImportBatches(
    Array.from({ length: 51 }, (_, i) => importRow(i + 1, "Note")),
    send,
  );
  expect(result.batchErrors[0]).toMatchObject({
    uncertain: true,
    indices: Array.from({ length: 50 }, (_, i) => i),
  });
  expect(result.notAttempted).toEqual([50]);
  expect(result.stopped?.kind).toBe("aborted");
});

it("recovers a lost response using the original receipt and preserves later edits", async () => {
  const ids: string[] = [];
  const result = await runImportBatches([importRow(1, "Imported note")], async (rows, batchId) => {
    ids.push(batchId);
    const response = await importSends(rows, {
      gradeScale: "native",
      onConflict: "overwrite",
      batchId,
    });
    if (ids.length === 1) {
      expect(response).toMatchObject({ ok: true, value: { imported: 1 } });
      await db.update(sends).set({ comment: "Later edit" }).where(eq(sends.climbId, 1));
      throw new Error("Response lost after commit");
    }
    return response;
  });
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  expect(result).toMatchObject({ imported: 1, overwritten: 0, batchErrors: [], stopped: null });
  expect(await db.select().from(sends).get()).toMatchObject({ comment: "Later edit" });
});

it("rolls back a receipt with a failed write so the same batch can be retried", async () => {
  const options = {
    gradeScale: "native" as const,
    onConflict: "overwrite" as const,
    batchId: "rolled-back",
  };
  await db.run(sql`CREATE TRIGGER fail_import_write BEFORE INSERT ON sends
    BEGIN SELECT RAISE(ABORT, 'simulated send failure'); END`);
  try {
    expect(await importSends([importRow(1, "Retry me")], options)).toMatchObject({ ok: false });
    expect(await db.select().from(importBatches)).toEqual([]);
    expect(await db.select().from(sends)).toEqual([]);
  } finally {
    await db.run(sql`DROP TRIGGER fail_import_write`);
  }
  expect(await importSends([importRow(1, "Retry me")], options)).toMatchObject({
    ok: true,
    value: { imported: 1 },
  });
  expect(await db.select().from(sends).get()).toMatchObject({ comment: "Retry me" });
});

it("scopes receipts to their owner", async () => {
  const options = {
    gradeScale: "native" as const,
    onConflict: "overwrite" as const,
    batchId: "shared-id",
  };
  expect(await importSends([importRow(1, "First owner")], options)).toMatchObject({
    ok: true,
    value: { imported: 1 },
  });
  state.id = "reviewer";
  expect(await importSends([importRow(1, "Second owner")], options)).toMatchObject({
    ok: true,
    value: { imported: 1 },
  });
  expect(
    (await db.select().from(sends))
      .map((send) => [send.userId, send.comment])
      .sort((a, b) => a[0]!.localeCompare(b[0]!)),
  ).toEqual([
    ["requester", "First owner"],
    ["reviewer", "Second owner"],
  ]);
});
