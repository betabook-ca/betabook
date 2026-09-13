import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import {
  createJournalEntry,
  createUndatedSend,
  updateJournalEntry,
  updateSend,
  removeMyJournalTag,
  importSends,
} from "@/actions";
import { applyClimbMerge } from "@/actions/moderation-apply";
import { createDb } from "@/db/client";
import { getJournalPage } from "@/db/queries/journal";
import { climbs, journalEntries, journalCompanions, sends, user } from "@/db/schema";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { seedFixtureFriendship, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
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
vi.mock("@/lib/rate-limit", () => ({ allowJournalWrite: async () => true }));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
const db = createDb(env.DB);
const ascentFields = {
  sent: "true",
  ascentStyle: "flash",
  rating: "4",
  suggestedGrade: "5",
  gradeFeel: "solid",
};
function form(ids: string[] = [], fields: Record<string, string> = {}) {
  const value = new FormData();
  for (const [key, field] of Object.entries({
    kind: "session",
    climbId: "1",
    entryDate: "2026-09-01",
    body: "Together",
    companionsChanged: "true",
    ...fields,
  }))
    value.set(key, field);
  for (const id of ids) value.append("companion", id);
  return value;
}
async function page(viewer = "author") {
  return getJournalPage(db, "author", viewer, parseJournalFilter({}));
}
beforeEach(async () => {
  identity.id = "author";
  await resetDb(db);
  await seedFixtureTree(db);
  for (const id of ["author", "partner", "stranger"])
    await seedFixtureUser(db, { id, journalVisibility: "public" });
  await seedFixtureFriendship(db, "author", "partner");
});
it("saves distinct companions with an entry and returns visible identities", async () => {
  expect((await createJournalEntry(form(["partner", "partner"]))).ok).toBe(true);
  expect((await page()).entries[0]).toMatchObject({
    companions: [{ id: "partner", name: "Test Climber partner", isSelf: false }],
  });
});
it("rejects ineligible companions and rolls back the ascent and entry", async () => {
  expect(
    (
      await createJournalEntry(
        form(["partner", "stranger"], {
          sent: "true",
          ascentStyle: "flash",
          rating: "4",
          suggestedGrade: "5",
          gradeFeel: "solid",
        }),
      )
    ).ok,
  ).toBe(false);
  expect(await db.select().from(sends)).toEqual([]);
  expect(await db.select().from(journalEntries)).toEqual([]);
});
it("rejects companions on undated sends", async () => {
  expect(
    (
      await createUndatedSend(
        form(["partner"], {
          dateSent: "",
          ascentStyle: "flash",
          rating: "4",
          suggestedGrade: "5",
          gradeFeel: "solid",
        }),
      )
    ).ok,
  ).toBe(false);
  expect(await db.select().from(sends)).toEqual([]);
});
it("preserves omitted companions and explicitly clears a changed selection", async () => {
  await createJournalEntry(form(["partner"]));
  const [entry] = await db.select().from(journalEntries);
  const unchanged = form([], { body: "Edited" });
  unchanged.delete("companionsChanged");
  expect((await updateJournalEntry(entry.id, unchanged)).ok).toBe(true);
  expect((await page()).entries[0]).toMatchObject({
    body: "Edited",
    companions: [{ id: "partner" }],
  });
  expect((await updateJournalEntry(entry.id, form())).ok).toBe(true);
  expect((await page()).entries[0]).toMatchObject({ companions: [] });
  expect(
    await db.select().from(journalEntries).where(eq(journalEntries.id, entry.id)),
  ).toHaveLength(1);
});
it("keeps companions on the author's ascent without crediting the friend with a send", async () => {
  const fields = {
    sent: "true",
    ascentStyle: "flash",
    rating: "4",
    suggestedGrade: "5",
    gradeFeel: "solid",
  };
  expect((await createJournalEntry(form(["partner"], fields))).ok).toBe(true);
  const entries = await db.select().from(journalEntries);
  expect(entries).toMatchObject([{ userId: "author", sent: true, isAscent: true }]);
  expect(await db.select().from(sends)).toMatchObject([{ userId: "author", climbId: 1 }]);
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: entries[0].id, userId: "partner", suppressed: false },
  ]);
  expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toMatchObject({
    sendCount: 1,
  });
});
it("rolls back an eligible session when one selected friend is invalid", async () => {
  expect((await createJournalEntry(form(["partner", "stranger"]))).ok).toBe(false);
  expect(await db.select().from(journalEntries)).toEqual([]);
  expect(await db.select().from(journalCompanions)).toEqual([]);
});
it("supports training while retaining its content requirement", async () => {
  const training = form(["partner"], { kind: "training", climbId: "", body: "Hangboard" });
  expect((await createJournalEntry(training)).ok).toBe(true);
  expect((await page()).entries[0]).toMatchObject({
    kind: "training",
    companions: [{ id: "partner" }],
  });
  training.set("body", "");
  expect((await createJournalEntry(training)).ok).toBe(false);
  expect(await db.select().from(journalEntries)).toHaveLength(1);
});
it("honors self-removal and rolls back stale replacement edits", async () => {
  await seedFixtureFriendship(db, "author", "stranger");
  await createJournalEntry(form(["partner"]));
  const [entry] = await db.select().from(journalEntries);
  identity.id = "partner";
  expect((await removeMyJournalTag(entry.id)).ok).toBe(true);
  expect((await page()).entries[0].companions).toEqual([]);
  identity.id = "author";
  expect(
    (await updateJournalEntry(entry.id, form(["stranger", "partner"], { body: "Stale update" })))
      .ok,
  ).toBe(false);
  expect((await page()).entries[0]).toMatchObject({ body: "Together", companions: [] });
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { userId: "partner", suppressed: true },
  ]);
  const ordinary = form([], { body: "Fresh note" });
  ordinary.delete("companionsChanged");
  expect((await updateJournalEntry(entry.id, ordinary)).ok).toBe(true);
  expect((await page()).entries[0].body).toBe("Fresh note");
});
it("requires ownership to edit and only lets the tagged person remove their tag", async () => {
  await createJournalEntry(form(["partner"]));
  const [entry] = await db.select().from(journalEntries);
  identity.id = "stranger";
  expect((await updateJournalEntry(entry.id, form())).ok).toBe(false);
  expect((await removeMyJournalTag(entry.id)).ok).toBe(false);
  identity.id = null;
  expect((await createJournalEntry(form(["partner"]))).ok).toBe(false);
  expect((await removeMyJournalTag(entry.id)).ok).toBe(false);
  expect((await page()).entries[0].companions).toHaveLength(1);
});
it("tags a private friend, re-sends that tag, and keeps it through an ordinary edit", async () => {
  await createJournalEntry(form(["partner"]));
  const [entry] = await db.select().from(journalEntries);
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "partner"));
  // The author sees their own tag, so the edit form re-sends it on the next save.
  expect((await page()).entries[0].companions).toMatchObject([{ id: "partner" }]);
  expect((await updateJournalEntry(entry.id, form(["partner"], { body: "Re-saved" }))).ok).toBe(
    true,
  );
  // A friend who is already private can also be tagged for the first time.
  await seedFixtureUser(db, { id: "mentor", journalVisibility: "public", isPrivate: true });
  await seedFixtureFriendship(db, "author", "mentor");
  expect((await updateJournalEntry(entry.id, form(["partner", "mentor"]))).ok).toBe(true);
  const ordinary = form([], { body: "Edited note" });
  ordinary.delete("companionsChanged");
  expect((await updateJournalEntry(entry.id, ordinary)).ok).toBe(true);
  const entries = (await page()).entries;
  expect(entries[0].body).toBe("Edited note");
  expect(entries[0].companions?.map((friend) => friend.id).sort()).toEqual(["mentor", "partner"]);
});
it("keeps each session and repeat's own companions when a separate send is recorded", async () => {
  await createJournalEntry(form(["partner"]));
  expect(
    (
      await createJournalEntry(
        form([], {
          sent: "true",
          ascentStyle: "flash",
          rating: "4",
          suggestedGrade: "5",
          gradeFeel: "solid",
        }),
      )
    ).ok,
  ).toBe(true);
  expect(
    (await createJournalEntry(form(["partner"], { sent: "true", entryDate: "2026-09-02" }))).ok,
  ).toBe(true);
  const entries = (await page()).entries;
  expect(entries.find((entry) => !entry.sent)?.companions).toMatchObject([{ id: "partner" }]);
  const repeat = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.entryDate, "2026-09-02"))
    .get();
  expect(
    await db.select().from(journalCompanions).where(eq(journalCompanions.entryId, repeat!.id)),
  ).toMatchObject([{ userId: "partner" }]);
  expect(await db.select().from(sends)).toMatchObject([{ userId: "author" }]);
});
it("retains companions and suppression when deleting a send demotes its journal history", async () => {
  await seedFixtureFriendship(db, "author", "stranger");
  await createJournalEntry(
    form(["partner", "stranger"], {
      sent: "true",
      ascentStyle: "flash",
      rating: "4",
      suggestedGrade: "5",
      gradeFeel: "solid",
    }),
  );
  await createJournalEntry(form(["partner"], { sent: "true", entryDate: "2026-09-02" }));
  const ascent = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.isAscent, true))
    .get();
  expect(ascent).toBeDefined();
  identity.id = "stranger";
  expect((await removeMyJournalTag(ascent!.id)).ok).toBe(true);
  identity.id = "author";
  const beforeTags = await db
    .select()
    .from(journalCompanions)
    .orderBy(journalCompanions.entryId, journalCompanions.userId);
  expect(beforeTags).toHaveLength(3);
  await db.delete(sends);
  const entries = await db.select().from(journalEntries);
  const retained = entries.find((entry) => entry.isSendComment)!;
  const formerRepeat = entries.find((entry) => !entry.isSendComment)!;
  expect(
    await db
      .select()
      .from(journalCompanions)
      .orderBy(journalCompanions.entryId, journalCompanions.userId),
  ).toEqual(beforeTags);
  expect((await updateJournalEntry(retained.id, form(["partner"]))).ok).toBe(true);
  expect(
    (
      await updateJournalEntry(
        formerRepeat.id,
        form(["partner"], { entryDate: formerRepeat.entryDate }),
      )
    ).ok,
  ).toBe(true);
});
it("validates selection bounds, self, pending and deleted identities", async () => {
  await seedFixtureFriendship(db, "author", "stranger", "pending");
  for (const ids of [
    ["author"],
    ["stranger"],
    ["deleted"],
    Array.from({ length: 11 }, (_, i) => String(i)),
  ]) {
    expect((await createJournalEntry(form(ids))).ok).toBe(false);
  }
  expect(await db.select().from(journalEntries)).toEqual([]);
});
it("attaches multiple distinct friends to only the newly inserted journal entry", async () => {
  await seedFixtureFriendship(db, "author", "stranger");
  for (let index = 0; index < 4; index += 1) await createJournalEntry(form());
  expect((await createJournalEntry(form(["partner", "stranger"]))).ok).toBe(true);
  const entries = (await page()).entries;
  expect(entries[0].companions?.map((friend) => friend.id)).toEqual(["partner", "stranger"]);
  expect(entries.slice(1).flatMap((row) => row.companions ?? [])).toEqual([]);
  const tags = await db.select().from(journalCompanions);
  expect(tags).toHaveLength(2);
  expect(tags.map((tag) => tag.entryId)).toEqual([entries[0].id, entries[0].id]);
});

it("preserves ordinary session companions and suppression through a real climb merge", async () => {
  await seedFixtureFriendship(db, "author", "stranger");
  expect(
    (await createJournalEntry(form(["partner", "stranger"], { body: "Source session" }))).ok,
  ).toBe(true);
  const [sourceEntry] = await db.select().from(journalEntries);
  identity.id = "stranger";
  expect((await removeMyJournalTag(sourceEntry.id)).ok).toBe(true);

  identity.id = "partner";
  expect(
    (await createJournalEntry(form(["author"], { climbId: "2", body: "Target session" }))).ok,
  ).toBe(true);
  const targetEntry = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, "partner"))
    .get();
  expect(targetEntry).toBeDefined();
  const beforeTags = await db
    .select()
    .from(journalCompanions)
    .orderBy(journalCompanions.entryId, journalCompanions.userId);
  expect(beforeTags).toHaveLength(3);

  await applyClimbMerge(db, 1, 2);

  expect(await db.select().from(journalEntries).orderBy(journalEntries.id)).toEqual([
    { ...sourceEntry, climbId: 2, updatedAt: expect.any(Date) },
    targetEntry,
  ]);
  expect(
    await db
      .select()
      .from(journalCompanions)
      .orderBy(journalCompanions.entryId, journalCompanions.userId),
  ).toEqual(beforeTags);
  expect((await page()).entries).toMatchObject([
    {
      id: sourceEntry.id,
      climbId: 2,
      sent: false,
      body: "Source session",
      companions: [{ id: "partner" }],
    },
  ]);
  const targetJournal = await getJournalPage(db, "partner", "partner", parseJournalFilter({}));
  expect(targetJournal.entries).toMatchObject([
    { id: targetEntry!.id, climbId: 2, companions: [{ id: "author" }] },
  ]);
  expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toBeUndefined();
  expect(await db.select().from(climbs).where(eq(climbs.id, 2)).get()).toMatchObject({
    id: 2,
    sendCount: 0,
  });
  expect(await db.select().from(sends)).toEqual([]);
});

it("rejects an unavailable companion on updateSend without changing send, ascent or aggregates", async () => {
  expect(
    (
      await createJournalEntry(
        form([], {
          sent: "true",
          ascentStyle: "flash",
          rating: "4",
          suggestedGrade: "5",
          gradeFeel: "solid",
        }),
      )
    ).ok,
  ).toBe(true);
  const beforeSends = await db.select().from(sends);
  const beforeEntries = await db.select().from(journalEntries);
  const beforeClimb = await db.select().from(climbs).where(eq(climbs.id, 1)).get();
  expect(beforeSends).toHaveLength(1);
  expect(beforeEntries).toHaveLength(1);

  const result = await updateSend(
    beforeSends[0].id,
    form(["partner", "stranger"], {
      dateSent: "2026-09-02",
      comment: "Forged update",
      ascentStyle: "redpoint",
      rating: "1",
      suggestedGrade: "4",
      gradeFeel: "soft",
    }),
  );

  expect(result).toEqual({
    ok: false,
    error:
      "A selected friend is no longer available for this entry. Refresh and update your tagged friends.",
  });
  expect(await db.select().from(sends)).toEqual(beforeSends);
  expect(await db.select().from(journalEntries)).toEqual(beforeEntries);
  expect(await db.select().from(climbs).where(eq(climbs.id, 1)).get()).toEqual(beforeClimb);
  expect(await db.select().from(journalCompanions)).toEqual([]);
});

it("saves, preserves, and clears companions through the dated send editor", async () => {
  expect((await createJournalEntry(form([], ascentFields))).ok).toBe(true);
  const [send] = await db.select().from(sends);
  const [ascent] = await db.select().from(journalEntries);
  const edit = form(["partner"], {
    ...ascentFields,
    dateSent: "2026-09-02",
    comment: "Sent with encouragement",
  });
  expect((await updateSend(send.id, edit)).ok).toBe(true);
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: ascent.id, userId: "partner" },
  ]);
  expect(await db.select().from(journalEntries)).toMatchObject([
    { id: ascent.id, entryDate: "2026-09-02", body: "Sent with encouragement" },
  ]);
  edit.delete("companion");
  edit.delete("companionsChanged");
  edit.set("comment", "Edited note");
  expect((await updateSend(send.id, edit)).ok).toBe(true);
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: ascent.id, userId: "partner" },
  ]);
  edit.set("companionsChanged", "true");
  expect((await updateSend(send.id, edit)).ok).toBe(true);
  expect(await db.select().from(journalCompanions)).toEqual([]);
  expect(await db.select().from(sends)).toMatchObject([
    { id: send.id, userId: "author", comment: "Edited note" },
  ]);
});

it("attaches companions when adding a date to an undated send", async () => {
  expect((await createUndatedSend(form([], { ...ascentFields, dateSent: "" }))).ok).toBe(true);
  const [send] = await db.select().from(sends);
  expect(
    (
      await updateSend(
        send.id,
        form(["partner"], { ...ascentFields, dateSent: "2026-09-01", comment: "Remembered date" }),
      )
    ).ok,
  ).toBe(true);
  const [ascent] = await db.select().from(journalEntries);
  expect(ascent).toMatchObject({ isAscent: true, userId: "author", entryDate: "2026-09-01" });
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: ascent.id, userId: "partner" },
  ]);
});

it("attaches companions to the repeat when recovering a legacy send's missing ascent", async () => {
  await db.insert(sends).values({
    userId: "author",
    climbId: 1,
    dateSent: "2026-09-01",
    ascentStyle: "flash",
    comment: "Original ascent",
  });
  expect(
    (await createJournalEntry(form(["partner"], { sent: "true", entryDate: "2026-09-02" }))).ok,
  ).toBe(true);
  const entries = await db.select().from(journalEntries).orderBy(journalEntries.id);
  expect(entries).toMatchObject([
    { isAscent: true, body: "Original ascent" },
    { isAscent: false, body: "Together" },
  ]);
  expect(await db.select().from(journalCompanions)).toMatchObject([
    { entryId: entries[1].id, userId: "partner" },
  ]);
});

it.each([false, true])(
  "preserves tagged ascent identities and suppression during climb merge (collision: %s)",
  async (collision) => {
    await seedFixtureFriendship(db, "author", "stranger");
    expect((await createJournalEntry(form(["partner", "stranger"], ascentFields))).ok).toBe(true);
    const [sourceEntry] = await db.select().from(journalEntries);
    identity.id = "stranger";
    expect((await removeMyJournalTag(sourceEntry.id)).ok).toBe(true);
    identity.id = "author";
    if (collision)
      expect(
        (await createJournalEntry(form(["partner"], { ...ascentFields, climbId: "2" }))).ok,
      ).toBe(true);
    const beforeTags = await db
      .select()
      .from(journalCompanions)
      .orderBy(journalCompanions.entryId, journalCompanions.userId);
    expect(beforeTags).toHaveLength(collision ? 3 : 2);
    await applyClimbMerge(db, 1, 2);
    expect(
      await db.select().from(journalEntries).where(eq(journalEntries.id, sourceEntry.id)).get(),
    ).toMatchObject({
      userId: "author",
      climbId: 2,
      isAscent: !collision,
      sent: !collision,
      isSendComment: true,
    });
    expect(
      await db
        .select()
        .from(journalCompanions)
        .orderBy(journalCompanions.entryId, journalCompanions.userId),
    ).toEqual(beforeTags);
    expect(await db.select().from(sends)).toMatchObject([{ userId: "author", climbId: 2 }]);
    expect(await db.select().from(climbs).where(eq(climbs.id, 2)).get()).toMatchObject({
      sendCount: 1,
    });
  },
);

it("preserves ascent companions and suppression while imports overwrite the send", async () => {
  await seedFixtureFriendship(db, "author", "stranger");
  expect((await createJournalEntry(form(["partner", "stranger"], ascentFields))).ok).toBe(true);
  const [ascent] = await db.select().from(journalEntries);
  identity.id = "stranger";
  expect((await removeMyJournalTag(ascent.id)).ok).toBe(true);
  identity.id = "author";
  const beforeTags = await db.select().from(journalCompanions).orderBy(journalCompanions.userId);
  expect(beforeTags).toHaveLength(2);
  expect(
    (
      await importSends(
        [
          {
            climbId: 1,
            ascentStyle: "redpoint",
            dateSent: "2026-09-02",
            comment: "Imported note",
            rating: null,
            gradeText: null,
            blankGradeMeans: "no-suggestion",
            gradeFeel: "solid",
          },
        ],
        { onConflict: "overwrite", gradeScale: "native" },
      )
    ).ok,
  ).toBe(true);
  expect(await db.select().from(journalEntries)).toMatchObject([
    { id: ascent.id, entryDate: "2026-09-02", body: "Imported note" },
  ]);
  expect(await db.select().from(journalCompanions).orderBy(journalCompanions.userId)).toEqual(
    beforeTags,
  );
});
