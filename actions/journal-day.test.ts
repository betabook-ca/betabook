import { env } from "cloudflare:test";
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDayEntries, createJournalEntry } from "@/actions";
import { createDb } from "@/db/client";
import { climbs, journalCompanions, journalEntries, sends } from "@/db/schema";
import { JOURNAL_RATE_LIMIT_MESSAGE } from "@/lib/action-result";
import { appendDayEntry, MAX_DAY_ENTRIES } from "@/lib/journal-day";
import { allowJournalWrite } from "@/lib/rate-limit";
import {
  seedFixtureFriendship,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "author" as string | null }));

vi.mock("next/cache", () => ({
  refresh: vi.fn<() => void>(),
  revalidatePath: vi.fn<() => void>(),
}));
vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    requireSession: async () => {
      if (!identity.id) throw new NotSignedInError();
      return { user: { id: identity.id } };
    },
  };
});
vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: vi.fn<() => Promise<boolean>>(async () => true),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

const HIGHBALL = 1;
const SLAB = 2;
const CRIMPER = 3;
const CRACK = 4;
const DAY = "2026-09-12";
const VIDEO_A = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const VIDEO_B = "https://www.youtube.com/shorts/abcdefghijk";

type Row = Record<string, string | string[]>;

function entry(climbId: number, fields: Row = {}): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries({ climbId: String(climbId), body: "", ...fields })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(name, item);
  }
  return form;
}

function ascent(climbId: number, fields: Row = {}): FormData {
  return entry(climbId, {
    sent: "true",
    ascentStyle: "flash",
    rating: "4",
    suggestedGrade: "5",
    gradeFeel: "solid",
    videosChanged: "true",
    ...fields,
  });
}

function day(entries: FormData[], { date = DAY, companions = ["partner"] } = {}): FormData {
  const form = new FormData();
  form.set("entryDate", date);
  form.set("companionsChanged", "true");
  for (const id of companions) form.append("companion", id);
  for (const [index, row] of entries.entries()) appendDayEntry(form, index, row);
  return form;
}

function entriesOn(date: string) {
  return db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, "author"), eq(journalEntries.entryDate, date)))
    .orderBy(asc(journalEntries.id));
}

function sendFor(climbId: number) {
  return db
    .select()
    .from(sends)
    .where(and(eq(sends.userId, "author"), eq(sends.climbId, climbId)))
    .get();
}

async function companionsOf(entryId: number) {
  const rows = await db
    .select({ userId: journalCompanions.userId })
    .from(journalCompanions)
    .where(eq(journalCompanions.entryId, entryId));
  return rows.map((row) => row.userId).sort((a, b) => a.localeCompare(b));
}

/** Logs the original ascent of SLAB on 2026-09-01, so a later day can repeat it. */
async function seedSlabAscent() {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    kind: "session",
    climbId: String(SLAB),
    entryDate: "2026-09-01",
    body: "First go.",
    sent: "true",
    ascentStyle: "redpoint",
    rating: "3",
    suggestedGrade: "2",
    gradeFeel: "solid",
  }))
    form.set(name, value);
  expect(await createJournalEntry(form)).toEqual({ ok: true, data: undefined });
}

beforeEach(async () => {
  identity.id = "author";
  vi.mocked(allowJournalWrite).mockClear();
  vi.mocked(allowJournalWrite).mockResolvedValue(true);
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "partner", "other-partner", "stranger"]) {
    await seedFixtureUser(db, { id });
  }
  await seedFixtureFriendship(db, "author", "partner");
  await seedFixtureFriendship(db, "author", "other-partner");
});

describe("createDayEntries", () => {
  it("logs an ascent, a repeat and a session on one date with the same friends", async () => {
    await seedSlabAscent();
    const slabSend = await sendFor(SLAB);

    const result = await createDayEntries(
      day(
        [
          ascent(HIGHBALL, { body: "Finally.", video: VIDEO_A }),
          entry(SLAB, { sent: "true", body: "Warm-up lap." }),
          entry(CRIMPER, { body: "Worked the crux." }),
        ],
        { companions: ["partner", "other-partner"] },
      ),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    const rows = await entriesOn(DAY);
    expect(rows).toMatchObject([
      { climbId: HIGHBALL, sent: true, isAscent: true, body: "Finally." },
      { climbId: SLAB, sent: true, isAscent: false, body: "Warm-up lap." },
      { climbId: CRIMPER, sent: false, isAscent: false, body: "Worked the crux." },
    ]);
    for (const row of rows) {
      expect(await companionsOf(row.id)).toEqual(["other-partner", "partner"]);
    }
    expect(await sendFor(HIGHBALL)).toMatchObject({
      dateSent: DAY,
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 5,
      comment: "Finally.",
      videos: [VIDEO_A],
    });
    expect(await sendFor(SLAB)).toEqual(slabSend);
    expect(await sendFor(CRIMPER)).toBeUndefined();
  });

  it("keeps each climb's own tags", async () => {
    const result = await createDayEntries(
      day([
        entry(HIGHBALL, { tag: ["project", "cold"] }),
        entry(SLAB, { tag: ["warm-up", "cold"] }),
        entry(CRIMPER),
      ]),
    );

    expect(result.ok).toBe(true);
    expect((await entriesOn(DAY)).map((row) => row.tags)).toEqual([
      ["project", "cold"],
      ["warm-up", "cold"],
      null,
    ]);
  });

  it("stores each first ascent's own videos on its send", async () => {
    const result = await createDayEntries(
      day([
        ascent(HIGHBALL, { video: VIDEO_A }),
        ascent(SLAB, { ascentStyle: "redpoint", suggestedGrade: "2", video: VIDEO_B }),
      ]),
    );

    expect(result.ok).toBe(true);
    expect((await sendFor(HIGHBALL))?.videos).toEqual([VIDEO_A]);
    expect((await sendFor(SLAB))?.videos).toEqual([VIDEO_B]);
  });

  it("recovers a send that predates the journal before logging its repeat", async () => {
    await seedFixtureSend(db, {
      userId: "author",
      climbId: CRIMPER,
      dateSent: "2026-08-01",
      comment: "Old send.",
    });

    const result = await createDayEntries(day([entry(CRIMPER, { sent: "true", body: "Again." })]));

    expect(result.ok).toBe(true);
    expect(await entriesOn("2026-08-01")).toMatchObject([
      { climbId: CRIMPER, sent: true, isAscent: true, body: "Old send." },
    ]);
    const [repeat] = await entriesOn(DAY);
    expect(repeat).toMatchObject({ climbId: CRIMPER, sent: true, isAscent: false });
    expect(await companionsOf(repeat.id)).toEqual(["partner"]);
  });

  it("charges the logging rate limit once for the whole day", async () => {
    const result = await createDayEntries(day([entry(HIGHBALL), entry(SLAB), entry(CRIMPER)]));

    expect(result.ok).toBe(true);
    expect(allowJournalWrite).toHaveBeenCalledTimes(1);
  });

  it("refuses once the rate limit is spent, before writing anything", async () => {
    vi.mocked(allowJournalWrite).mockResolvedValue(false);

    expect(await createDayEntries(day([entry(HIGHBALL)]))).toEqual({
      ok: false,
      error: JOURNAL_RATE_LIMIT_MESSAGE,
    });
    expect(await entriesOn(DAY)).toEqual([]);
  });

  describe("saves nothing when one climb can't be logged", () => {
    it.each<[string, () => Promise<FormData>, string]>([
      [
        "a climb that broke before the date",
        async () => {
          await db.update(climbs).set({ brokenOn: "2026-09-10" }).where(eq(climbs.id, SLAB));
          return day([ascent(HIGHBALL), entry(SLAB)]);
        },
        "Test Slab:",
      ],
      [
        "a repeat dated before its ascent",
        async () => {
          await seedSlabAscent();
          return day([ascent(HIGHBALL), entry(SLAB, { sent: "true" })], { date: "2026-08-20" });
        },
        "Test Slab: A repeat can't be earlier than the recorded ascent",
      ],
      [
        "video fields on a repeat",
        async () => {
          await seedSlabAscent();
          return day([
            ascent(HIGHBALL),
            entry(SLAB, { sent: "true", videosChanged: "true", video: VIDEO_B }),
          ]);
        },
        "Test Slab: A repeat doesn't carry a rating or a grade",
      ],
      [
        "a rating on a plain session",
        async () => day([ascent(HIGHBALL), entry(CRIMPER, { rating: "4" })]),
        "Test Crimper: A session doesn't carry a rating or a grade",
      ],
      [
        "an invalid video link",
        async () => day([ascent(HIGHBALL), ascent(SLAB, { video: "https://example.com/x" })]),
        "Test Slab:",
      ],
      [
        "too many tags",
        async () =>
          day([
            ascent(HIGHBALL),
            entry(CRIMPER, { tag: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }),
          ]),
        "Test Crimper: 9 tags — the limit is 8",
      ],
      [
        "a companion who isn't a friend",
        async () => day([ascent(HIGHBALL), entry(SLAB)], { companions: ["partner", "stranger"] }),
        "A selected friend is no longer available",
      ],
    ])("%s", async (_, build, message) => {
      const form = await build();
      const before = await db.select().from(journalEntries);

      const result = await createDayEntries(form);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(message);
      expect(await db.select().from(journalEntries)).toEqual(before);
      expect(await sendFor(HIGHBALL)).toBeUndefined();
    });
  });

  it.each<[string, () => FormData, string]>([
    ["no climbs", () => day([]), "Add a climb to log this day"],
    ["no date", () => day([entry(HIGHBALL)], { date: "" }), "Entry date is required"],
    [
      "the same climb twice",
      () => day([entry(HIGHBALL), entry(HIGHBALL, { sent: "true" })]),
      "Test Highball is in this day twice",
    ],
    [
      "more climbs than a day holds",
      () => {
        const form = day([entry(HIGHBALL)]);
        appendDayEntry(form, MAX_DAY_ENTRIES, entry(SLAB));
        return form;
      },
      "Invalid day entry",
    ],
    [
      "a gap in the rows",
      () => {
        const form = day([entry(HIGHBALL)]);
        appendDayEntry(form, 2, entry(SLAB));
        return form;
      },
      "Invalid day entry",
    ],
    [
      "a row with its own date",
      () => day([entry(HIGHBALL, { entryDate: "2026-01-01" })]),
      "Invalid day entry",
    ],
    [
      "a row with its own friends",
      () => day([entry(HIGHBALL, { companion: "stranger" })]),
      "Invalid day entry",
    ],
    ["a climb that doesn't exist", () => day([entry(999)]), "Climb not found"],
  ])("rejects %s", async (_, build, message) => {
    const result = await createDayEntries(build());

    expect(result).toEqual({ ok: false, error: expect.stringContaining(message) });
    expect(await db.select().from(journalEntries)).toEqual([]);
  });

  it("logs a day without tagged friends", async () => {
    const result = await createDayEntries(day([entry(CRACK)], { companions: [] }));

    expect(result.ok).toBe(true);
    const [row] = await entriesOn(DAY);
    expect(await companionsOf(row.id)).toEqual([]);
  });

  it("requires a session", async () => {
    identity.id = null;

    expect((await createDayEntries(day([entry(HIGHBALL)]))).ok).toBe(false);
    expect(await db.select().from(journalEntries)).toEqual([]);
  });
});
