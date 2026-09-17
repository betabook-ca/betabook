import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { importSends } from "@/actions";
import { createDb } from "@/db/client";
import { climbs, journalEntries, sends } from "@/db/schema";
import type { ImportSendRow } from "@/lib/sends";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser, seedManyClimbs } from "@/test/fixtures";

/** A wizard-bypassing caller (or a climb marked broken between the lookup
 * and the commit) can hand importSends a row the climb refuses. The row is
 * reported in `broken` and the rest of the batch still commits — letting the
 * 0044 triggers catch it instead would abort every row in the batch. */

const sessionState = vi.hoisted(() => ({ userId: "ib-user" as string | null }));

vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: () => {} }));

vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    getSession: async () => (sessionState.userId ? { user: { id: sessionState.userId } } : null),
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

/** Bulk climbs 300-309 live in Test Slab Area; 305 is marked broken. */
const BROKEN = 305;
const BROKEN_ON = "2026-03-05";

function row(climbId: number, overrides: Partial<ImportSendRow> = {}): ImportSendRow {
  return {
    climbId,
    ascentStyle: "redpoint",
    dateSent: "2026-01-10",
    rating: null,
    comment: null,
    gradeText: null,
    blankGradeMeans: "posted-grade",
    gradeFeel: "solid",
    ...overrides,
  };
}

function sendFor(climbId: number) {
  return db
    .select()
    .from(sends)
    .where(and(eq(sends.userId, "ib-user"), eq(sends.climbId, climbId)))
    .get();
}

const SKIP = { gradeScale: "native", onConflict: "skip" } as const;
const OVERWRITE = { gradeScale: "native", onConflict: "overwrite" } as const;

beforeAll(async () => {
  await seedFixtureTree(db);
  await seedManyClimbs(db, 5, 10, 300);
  await seedFixtureUser(db, { id: "ib-user" });
  await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, BROKEN));
});

beforeEach(async () => {
  sessionState.userId = "ib-user";
  await db.delete(journalEntries);
  await db.delete(sends);
});

describe("importSends against a broken climb", () => {
  it("reports post-break and undated rows as broken while committing the rest", async () => {
    const result = await importSends(
      [
        row(300),
        row(BROKEN, { dateSent: BROKEN_ON }),
        row(301),
        row(302, { climbId: BROKEN, dateSent: null }),
      ],
      SKIP,
    );
    expect(result).toEqual({
      ok: true,
      value: { imported: 2, overwritten: 0, alreadyLogged: 0, missing: [], broken: [1, 3] },
    });
    expect(await sendFor(300)).toBeDefined();
    expect(await sendFor(301)).toBeDefined();
    expect(await sendFor(BROKEN)).toBeUndefined();
    // The refused rows left no journal day behind either.
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, "ib-user"));
    expect(entries.map((entry) => entry.climbId ?? 0).sort((a, b) => a - b)).toEqual([300, 301]);
  });

  it("imports an ascent dated before the break like any other row", async () => {
    expect(await importSends([row(BROKEN, { dateSent: "2026-03-04" })], SKIP)).toEqual({
      ok: true,
      value: { imported: 1, overwritten: 0, alreadyLogged: 0, missing: [], broken: [] },
    });
    expect(await sendFor(BROKEN)).toMatchObject({ dateSent: "2026-03-04" });
  });

  it("refuses an overwrite that moves the date onto the break, but not one that keeps it", async () => {
    // A legacy undated send, logged before the climb was marked broken.
    await db.update(climbs).set({ brokenOn: null }).where(eq(climbs.id, BROKEN));
    await seedFixtureSend(db, { userId: "ib-user", climbId: BROKEN, dateSent: null, rating: 2 });
    await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, BROKEN));

    expect(
      await importSends([row(BROKEN, { dateSent: "2026-06-01", rating: 5 })], OVERWRITE),
    ).toEqual({
      ok: true,
      value: { imported: 0, overwritten: 0, alreadyLogged: 0, missing: [], broken: [0] },
    });
    expect(await sendFor(BROKEN)).toMatchObject({ dateSent: null, rating: 2 });

    // Same date as before (still undated): the triggers only watch date changes, and so does the action.
    expect(await importSends([row(BROKEN, { dateSent: null, rating: 5 })], OVERWRITE)).toEqual({
      ok: true,
      value: { imported: 0, overwritten: 1, alreadyLogged: 0, missing: [], broken: [] },
    });
    expect(await sendFor(BROKEN)).toMatchObject({ dateSent: null, rating: 5 });

    // Skip mode never reaches the date at all for an already-logged climb.
    expect(await importSends([row(BROKEN, { dateSent: "2026-06-01" })], SKIP)).toEqual({
      ok: true,
      value: { imported: 0, overwritten: 0, alreadyLogged: 1, missing: [], broken: [] },
    });
  });
});
