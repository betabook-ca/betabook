import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createJournalEntry, createUndatedSend, updateJournalEntry, updateSend } from "@/actions";
import { createDb } from "@/db/client";
import { climbs, journalEntries, sends } from "@/db/schema";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "jb-user" as string | null }));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

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

vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

/** Fixture climb 1 is marked broken; climb 2 stays intact. */
const BROKEN = 1;
const INTACT = 2;
const BROKEN_ON = "2026-03-05";
const REFUSAL = "This climb broke on 2026-03-05. Only ascents dated before that can be logged.";

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function sessionForm(climbId: number, entryDate: string) {
  return form({ kind: "session", climbId: String(climbId), entryDate, body: "Worked it." });
}

function ascentForm(climbId: number, dateSent: string) {
  return form({
    kind: "session",
    climbId: String(climbId),
    entryDate: dateSent,
    sent: "true",
    ascentStyle: "flash",
    rating: "4",
    suggestedGrade: "5",
    gradeFeel: "solid",
    dateSent,
  });
}

function sendFor(climbId: number) {
  return db
    .select()
    .from(sends)
    .where(and(eq(sends.userId, "jb-user"), eq(sends.climbId, climbId)))
    .get();
}

function entriesFor(climbId: number) {
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, "jb-user"), eq(journalEntries.climbId, climbId)));
}

beforeAll(async () => {
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "jb-user" });
  await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, BROKEN));
});

beforeEach(async () => {
  sessionState.userId = "jb-user";
  await db.delete(journalEntries);
  await db.delete(sends);
});

describe("logging on a broken climb", () => {
  it("refuses an undated send, which can't be shown to predate the break", async () => {
    const result = await createUndatedSend(
      form({ climbId: String(BROKEN), ascentStyle: "flash", suggestedGrade: "5", dateSent: "" }),
    );
    expect(result).toEqual({ ok: false, error: REFUSAL });
    expect(await sendFor(BROKEN)).toBeUndefined();

    // The same form against an intact climb saves.
    expect(
      (
        await createUndatedSend(
          form({
            climbId: String(INTACT),
            ascentStyle: "flash",
            suggestedGrade: "2",
            dateSent: "",
          }),
        )
      ).ok,
    ).toBe(true);
    expect(await sendFor(INTACT)).toMatchObject({ dateSent: null });
  });

  it("accepts a session or ascent dated before the break and refuses one on or after it", async () => {
    expect((await createJournalEntry(sessionForm(BROKEN, "2026-03-04"))).ok).toBe(true);
    expect(await createJournalEntry(sessionForm(BROKEN, BROKEN_ON))).toEqual({
      ok: false,
      error: REFUSAL,
    });
    expect(await createJournalEntry(ascentForm(BROKEN, "2026-04-01"))).toEqual({
      ok: false,
      error: REFUSAL,
    });
    expect((await entriesFor(BROKEN)).map((entry) => entry.entryDate)).toEqual(["2026-03-04"]);
    expect(await sendFor(BROKEN)).toBeUndefined();

    expect((await createJournalEntry(ascentForm(BROKEN, "2026-02-01"))).ok).toBe(true);
    expect(await sendFor(BROKEN)).toMatchObject({ dateSent: "2026-02-01" });
  });

  it("refuses moving an existing session's date onto or past the break", async () => {
    await seedFixtureJournalEntry(db, {
      userId: "jb-user",
      climbId: BROKEN,
      entryDate: "2026-01-10",
      body: "Early attempt",
    });
    const [entry] = await entriesFor(BROKEN);
    expect(
      await updateJournalEntry(
        entry.id,
        form({ kind: "session", climbId: String(BROKEN), entryDate: "2026-03-05", body: "Moved" }),
      ),
    ).toEqual({ ok: false, error: REFUSAL });
    // Editing without touching the date is unaffected.
    expect(
      (
        await updateJournalEntry(
          entry.id,
          form({
            kind: "session",
            climbId: String(BROKEN),
            entryDate: "2026-01-10",
            body: "Edited",
          }),
        )
      ).ok,
    ).toBe(true);
    expect((await entriesFor(BROKEN))[0]).toMatchObject({
      entryDate: "2026-01-10",
      body: "Edited",
    });
  });

  it("keeps a legacy undated send editable but refuses giving it a post-break date", async () => {
    // Seeded directly: a send that existed before the climb was marked broken.
    await db.update(climbs).set({ brokenOn: null }).where(eq(climbs.id, BROKEN));
    await seedFixtureSend(db, { userId: "jb-user", climbId: BROKEN, dateSent: null, rating: 2 });
    await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, BROKEN));
    const existing = await sendFor(BROKEN);
    expect(existing).toBeDefined();

    const base = { ascentStyle: "redpoint", suggestedGrade: "5", gradeFeel: "solid" };
    expect((await updateSend(existing!.id, form({ ...base, rating: "5", dateSent: "" }))).ok).toBe(
      true,
    );
    expect(await sendFor(BROKEN)).toMatchObject({ rating: 5, dateSent: null });

    expect(await updateSend(existing!.id, form({ ...base, dateSent: "2026-06-01" }))).toEqual({
      ok: false,
      error: REFUSAL,
    });
    expect((await updateSend(existing!.id, form({ ...base, dateSent: "2026-03-01" }))).ok).toBe(
      true,
    );
    expect(await sendFor(BROKEN)).toMatchObject({ dateSent: "2026-03-01" });
  });
});
