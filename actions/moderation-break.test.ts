import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveChangeRequest,
  createJournalEntry,
  requestClimbBreak,
  requestClimbMerge,
  updateSend,
} from "@/actions";
import { applyClimbBreak, assertClimbMergeable } from "@/actions/moderation-apply";
import { createDb } from "@/db/client";
import { getChangeRequest } from "@/db/queries";
import { adminAreaScopes, changeRequests, climbs, journalEntries, sends, user } from "@/db/schema";
import { sendChangeRequestDecisionEmail } from "@/lib/email";
import { describeChangeRequest, type ChangeRequestPayload } from "@/lib/moderation";
import {
  seedFixtureJournalEntry,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const sessionState = vi.hoisted(() => ({
  userId: "break-reporter" as string | null,
  role: null as string | null,
}));

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

vi.mock("@/lib/email", () => ({
  sendChangeRequestDecisionEmail: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: vi.fn<() => Promise<boolean>>(async () => true),
}));

vi.mock("@/lib/session", async () => {
  const { NotAdminError, NotSignedInError } = await import("@/lib/action-result");
  const isAdmin = (session: { user: { role?: string | null } }) => session.user.role === "admin";
  return {
    getSession: async () =>
      sessionState.userId ? { user: { id: sessionState.userId, role: sessionState.role } } : null,
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId, role: sessionState.role } };
    },
    requireAdmin: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      const session = { user: { id: sessionState.userId, role: sessionState.role } };
      if (!isAdmin(session)) throw new NotAdminError();
      return session;
    },
    isAdmin,
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

/** Fixture: Test Highball (1, boulder V4, in area 4) and Test Crack (4, trad 5.6, area 3). */
const HIGHBALL = 1;
const CRACK = 4;
const BROKEN_ON = "2026-03-05";

function breakForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const fields = { brokenOn: BROKEN_ON, reason: "The key flake snapped off", ...overrides };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const EXPECTED_TEXTS = {
  successorName: "Test Highball - post break (2026)",
  appendedDescription:
    "This climb broke on 2026-03-05. The key flake snapped off. " +
    "Ascents from before that date can still be logged. " +
    "The post-break version is listed as Test Highball - post break (2026).",
  successorDescription:
    "Post-break version of Test Highball, which broke on 2026-03-05. " +
    "Its V4 grade is carried over from the original as a placeholder until it sees more ascents.",
};

async function actAsAdmin(userId = sessionState.userId) {
  if (!userId) throw new Error("Expected a signed-in fixture user");
  sessionState.userId = userId;
  sessionState.role = "admin";
  await db.update(user).set({ role: "admin" }).where(eq(user.id, userId));
}

function climbsInArea(areaId: number) {
  return db.select().from(climbs).where(eq(climbs.areaId, areaId));
}

async function successorOf(areaId: number, originalId: number) {
  const successor = (await climbsInArea(areaId)).find((row) => row.id !== originalId);
  if (!successor) throw new Error("expected a successor climb");
  return successor;
}

function pendingBreaksFor(climbId: number) {
  return db
    .select()
    .from(changeRequests)
    .where(and(eq(changeRequests.type, "climb_break"), eq(changeRequests.entityId, climbId)));
}

function sendsOn(climbId: number) {
  return db.select().from(sends).where(eq(sends.climbId, climbId)).orderBy(sends.userId);
}

function entriesOn(climbId: number) {
  return db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.climbId, climbId))
    .orderBy(journalEntries.userId, journalEntries.entryDate);
}

/** A dated send plus its mirrored ascent entry, the way the app logs one. */
async function seedAscent(
  userId: string,
  climbId: number,
  dateSent: string,
  extra: { rating?: number; ascentStyle?: "redpoint" | "flash" } = {},
) {
  await seedFixtureSend(db, { userId, climbId, dateSent, ...extra });
  await seedFixtureJournalEntry(db, {
    userId,
    climbId,
    entryDate: dateSent,
    sent: true,
    isAscent: true,
  });
}

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "break-reporter" });
  await seedFixtureUser(db, { id: "break-reviewer", role: "admin" });
  await seedFixtureUser(db, { id: "break-climber" });
  await seedFixtureUser(db, { id: "break-early" });
  await seedFixtureUser(db, { id: "break-undated" });
  await db.insert(adminAreaScopes).values([
    { userId: "break-reporter", areaId: 1 },
    { userId: "break-reviewer", areaId: 1 },
  ]);
  sessionState.userId = "break-reporter";
  sessionState.role = null;
  vi.mocked(sendChangeRequestDecisionEmail).mockClear();
});

describe("requestClimbBreak", () => {
  it("queues the composed texts and the later-history counts without touching the climb", async () => {
    await seedAscent("break-climber", HIGHBALL, "2026-04-01");
    await seedFixtureJournalEntry(db, {
      userId: "break-climber",
      climbId: HIGHBALL,
      entryDate: "2026-01-15",
    });
    expect(await requestClimbBreak(HIGHBALL, breakForm())).toEqual({
      ok: true,
      value: { status: "pending" },
    });
    const [request] = await pendingBreaksFor(HIGHBALL);
    expect(request.status).toBe("pending");
    expect(JSON.parse(request.payload)).toEqual({
      brokenOn: BROKEN_ON,
      reason: "The key flake snapped off",
      ...EXPECTED_TEXTS,
      laterSends: 1,
      laterEntries: 1,
    });
    expect(await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get()).toMatchObject({
      brokenOn: null,
      description: null,
    });
    expect(await climbsInArea(4)).toHaveLength(1);
    expect((await sendsOn(HIGHBALL)).map((row) => row.userId)).toEqual(["break-climber"]);
  });

  it("omits the placeholder-grade sentence for an ungraded climb", async () => {
    await db.update(climbs).set({ grade: null }).where(eq(climbs.id, CRACK));
    expect((await requestClimbBreak(CRACK, breakForm({ brokenOn: "2025-12-31" }))).ok).toBe(true);
    const [request] = await pendingBreaksFor(CRACK);
    expect(JSON.parse(request.payload)).toMatchObject({
      successorName: "Test Crack - post break (2025)",
      successorDescription: "Post-break version of Test Crack, which broke on 2025-12-31.",
      laterSends: 0,
      laterEntries: 0,
    });
  });

  it.each([
    [{ brokenOn: "" }, "Date is required"],
    [{ brokenOn: "2026-02-30" }, "Invalid date"],
    [{ brokenOn: "2999-01-01" }, "The break date can't be in the future"],
    [{ reason: "  " }, "Reason is required"],
  ])("rejects %j", async (overrides, error) => {
    expect(await requestClimbBreak(HIGHBALL, breakForm(overrides))).toEqual({ ok: false, error });
    expect(await pendingBreaksFor(HIGHBALL)).toEqual([]);
  });

  it("refuses a climb that is already broken", async () => {
    await db.update(climbs).set({ brokenOn: "2025-01-01" }).where(eq(climbs.id, HIGHBALL));
    expect(await requestClimbBreak(HIGHBALL, breakForm())).toEqual({
      ok: false,
      error: "This climb is already marked as broken on 2025-01-01",
    });
  });

  it("applies immediately for an admin covering the area, creating the successor", async () => {
    await db
      .update(climbs)
      .set({ description: "Tall and committing." })
      .where(eq(climbs.id, HIGHBALL));
    await actAsAdmin();
    expect(await requestClimbBreak(HIGHBALL, breakForm())).toEqual({
      ok: true,
      value: { status: "applied" },
    });

    const rows = await climbsInArea(4);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === HIGHBALL)).toMatchObject({
      brokenOn: BROKEN_ON,
      description: `Tall and committing.\n\n${EXPECTED_TEXTS.appendedDescription}`,
    });
    expect(rows.find((row) => row.id !== HIGHBALL)).toMatchObject({
      name: EXPECTED_TEXTS.successorName,
      type: "boulder",
      grade: 5,
      areaId: 4,
      brokenOn: null,
      description: EXPECTED_TEXTS.successorDescription,
      sendCount: 0,
    });
    const [audit] = await pendingBreaksFor(HIGHBALL);
    expect(audit).toMatchObject({ status: "approved", reviewedBy: "break-reporter" });
  });
});

describe("moving later history to the successor", () => {
  beforeEach(async () => {
    // Climbed only the new line: a send after the break, its ascent entry, a
    // later repeat, and an earlier attempt that stays behind.
    await seedAscent("break-climber", HIGHBALL, "2026-04-01", { rating: 4, ascentStyle: "flash" });
    await seedFixtureJournalEntry(db, {
      userId: "break-climber",
      climbId: HIGHBALL,
      entryDate: "2026-05-01",
      sent: true,
      body: "Repeated it",
    });
    await seedFixtureJournalEntry(db, {
      userId: "break-climber",
      climbId: HIGHBALL,
      entryDate: "2026-01-15",
      body: "First look",
    });
    // Climbed both lines: sent before the break, then logged a repeat and a
    // plain session after it.
    await seedAscent("break-early", HIGHBALL, "2026-01-10", { rating: 2, ascentStyle: "redpoint" });
    await seedFixtureJournalEntry(db, {
      userId: "break-early",
      climbId: HIGHBALL,
      entryDate: "2026-06-01",
      sent: true,
      body: "Back on the new line",
    });
    await seedFixtureJournalEntry(db, {
      userId: "break-early",
      climbId: HIGHBALL,
      entryDate: "2026-07-01",
      body: "Working the new crux",
    });
    // An undated send can't be placed on either side and stays put.
    await seedFixtureSend(db, {
      userId: "break-undated",
      climbId: HIGHBALL,
      dateSent: null,
      rating: 5,
    });
  });

  it("moves post-break sends and entries, creates a send for repeat-only climbers, and leaves the rest", async () => {
    await actAsAdmin();
    expect(await requestClimbBreak(HIGHBALL, breakForm())).toEqual({
      ok: true,
      value: { status: "applied" },
    });
    const successor = await successorOf(4, HIGHBALL);

    expect(await sendsOn(successor.id)).toEqual([
      expect.objectContaining({
        userId: "break-climber",
        dateSent: "2026-04-01",
        ascentStyle: "flash",
        rating: 4,
      }),
      // Undated on purpose: the repeats say when they climbed the new line,
      // and a dated send here would have no ascent entry to mirror.
      expect.objectContaining({
        userId: "break-early",
        dateSent: null,
        ascentStyle: "redpoint",
        rating: null,
        comment: null,
        suggestedGrade: null,
        gradeFeel: "solid",
      }),
    ]);
    expect(await sendsOn(HIGHBALL)).toEqual([
      expect.objectContaining({ userId: "break-early", dateSent: "2026-01-10", rating: 2 }),
      expect.objectContaining({ userId: "break-undated", dateSent: null, rating: 5 }),
    ]);

    expect(
      (await entriesOn(successor.id)).map((e) => [e.userId, e.entryDate, e.sent, e.isAscent]),
    ).toEqual([
      ["break-climber", "2026-04-01", true, true],
      ["break-climber", "2026-05-01", true, false],
      ["break-early", "2026-06-01", true, false],
      ["break-early", "2026-07-01", false, false],
    ]);
    expect(
      (await entriesOn(HIGHBALL)).map((e) => [e.userId, e.entryDate, e.sent, e.isAscent]),
    ).toEqual([
      ["break-climber", "2026-01-15", false, false],
      ["break-early", "2026-01-10", true, true],
    ]);

    // The aggregate triggers followed the moves.
    expect(await db.select().from(climbs).where(eq(climbs.id, HIGHBALL)).get()).toMatchObject({
      sendCount: 2,
      ratingSum: 7,
      ratingCount: 2,
    });
    expect(successor).toMatchObject({ sendCount: 2, ratingSum: 4, ratingCount: 1 });

    const [audit] = await pendingBreaksFor(HIGHBALL);
    expect(JSON.parse(audit.payload)).toMatchObject({ laterSends: 1, laterEntries: 4 });
  });

  it("moves whatever is there at approval time, not what was counted at request time", async () => {
    expect((await requestClimbBreak(HIGHBALL, breakForm())).ok).toBe(true);
    const [request] = await pendingBreaksFor(HIGHBALL);
    expect(JSON.parse(request.payload)).toMatchObject({ laterSends: 1, laterEntries: 4 });
    // A new climber logs the post-break line while the request waits.
    await seedFixtureUser(db, { id: "break-late" });
    await seedAscent("break-late", HIGHBALL, "2026-08-01");

    await actAsAdmin("break-reviewer");
    expect(await approveChangeRequest(request.id)).toEqual({
      ok: true,
      value: { decision: "applied" },
    });
    const successor = await successorOf(4, HIGHBALL);
    expect((await sendsOn(successor.id)).map((row) => row.userId)).toEqual([
      "break-climber",
      "break-early",
      "break-late",
    ]);
    expect((await entriesOn(successor.id)).map((e) => e.userId)).toContain("break-late");
  });
});

describe("after the move, a repeat-only climber's successor send behaves like any undated send", () => {
  it("takes a rating edit without a journal row and a new repeat without a duplicate", async () => {
    await seedAscent("break-early", HIGHBALL, "2026-01-10", { ascentStyle: "redpoint" });
    await seedFixtureJournalEntry(db, {
      userId: "break-early",
      climbId: HIGHBALL,
      entryDate: "2026-06-01",
      sent: true,
      body: "Back on the new line",
    });
    await actAsAdmin();
    expect((await requestClimbBreak(HIGHBALL, breakForm())).ok).toBe(true);
    const successor = await successorOf(4, HIGHBALL);
    const [moved] = await sendsOn(successor.id);
    expect(moved).toMatchObject({ userId: "break-early", dateSent: null });

    sessionState.userId = "break-early";
    sessionState.role = null;
    const rating = new FormData();
    rating.set("ascentStyle", "redpoint");
    rating.set("dateSent", "");
    rating.set("rating", "3");
    rating.set("suggestedGrade", "5");
    rating.set("gradeFeel", "solid");
    expect(await updateSend(moved.id, rating)).toEqual({ ok: true, value: undefined });

    const repeat = new FormData();
    repeat.set("kind", "session");
    repeat.set("climbId", String(successor.id));
    repeat.set("entryDate", "2026-06-01");
    repeat.set("sent", "true");
    repeat.set("body", "Same day, second go");
    expect(await createJournalEntry(repeat)).toEqual({ ok: true, value: undefined });

    // Exactly the moved repeat plus the new one — no ascent entry was
    // conjured on 2026-06-01, and nothing was mirrored twice.
    expect((await entriesOn(successor.id)).map((e) => [e.entryDate, e.body, e.isAscent])).toEqual([
      ["2026-06-01", "Back on the new line", false],
      ["2026-06-01", "Same day, second go", false],
    ]);
    expect(await sendsOn(successor.id)).toEqual([
      expect.objectContaining({ userId: "break-early", dateSent: null, rating: 3 }),
    ]);
  });
});

describe("approving a climb_break request", () => {
  it("writes the stored texts verbatim, rejects other pending breaks, and emails the reporter", async () => {
    expect((await requestClimbBreak(HIGHBALL, breakForm())).ok).toBe(true);
    const [request] = await pendingBreaksFor(HIGHBALL);
    // A second reporter's request for the same climb.
    sessionState.userId = "break-climber";
    expect((await requestClimbBreak(HIGHBALL, breakForm({ reason: "Also saw it fall" }))).ok).toBe(
      true,
    );
    // A rename after the request must not alter what lands.
    await db.update(climbs).set({ name: "Renamed Highball" }).where(eq(climbs.id, HIGHBALL));

    await actAsAdmin("break-reviewer");
    expect(await approveChangeRequest(request.id)).toEqual({
      ok: true,
      value: { decision: "applied" },
    });

    const rows = await climbsInArea(4);
    expect(rows.map((row) => row.name).sort()).toEqual([
      "Renamed Highball",
      "Test Highball - post break (2026)",
    ]);
    expect(rows.find((row) => row.id === HIGHBALL)).toMatchObject({
      brokenOn: BROKEN_ON,
      description: EXPECTED_TEXTS.appendedDescription,
    });

    const requests = await pendingBreaksFor(HIGHBALL);
    expect(requests.map((row) => row.status).sort()).toEqual(["approved", "rejected"]);
    expect(requests.find((row) => row.status === "rejected")).toMatchObject({
      requestedBy: "break-climber",
      reviewNote: "This climb has already been marked as broken.",
    });
    expect(vi.mocked(sendChangeRequestDecisionEmail)).toHaveBeenCalledWith(
      "break-reporter@example.com",
      expect.objectContaining({
        decision: "approved",
        summary: 'Report "Renamed Highball" as broken on 2026-03-05',
      }),
    );
  });

  it("describes the request with the date, reason, successor, the move, and both texts", async () => {
    await seedAscent("break-climber", HIGHBALL, "2026-04-01");
    expect((await requestClimbBreak(HIGHBALL, breakForm())).ok).toBe(true);
    const [request] = await pendingBreaksFor(HIGHBALL);
    const description = await describeChangeRequest(db, request);
    expect(description.summary).toBe('Mark "Test Highball" as broken on 2026-03-05');
    expect(description.href).toBe("/climbs/1/test-highball");
    expect(description.details).toEqual([
      "Broke on: 2026-03-05",
      "Reason: The key flake snapped off",
      'New climb: "Test Highball - post break (2026)" at V4',
      "Moves 1 send(s) and 1 journal entry dated on or after 2026-03-05 to the new climb (counted when reported)",
      `Description of "Test Highball" becomes: ${EXPECTED_TEXTS.appendedDescription}`,
      `Description of the new climb: ${EXPECTED_TEXTS.successorDescription}`,
    ]);

    await db.delete(changeRequests);
    expect((await requestClimbBreak(CRACK, breakForm())).ok).toBe(true);
    const [quiet] = await pendingBreaksFor(CRACK);
    expect((await describeChangeRequest(db, quiet)).details).toContain(
      "Nothing dated on or after 2026-03-05 to move (counted when reported)",
    );
  });

  it("fails cleanly when the climb was broken between the request and the approval", async () => {
    expect((await requestClimbBreak(HIGHBALL, breakForm())).ok).toBe(true);
    const [request] = await pendingBreaksFor(HIGHBALL);
    await db.update(climbs).set({ brokenOn: "2026-01-01" }).where(eq(climbs.id, HIGHBALL));
    await actAsAdmin("break-reviewer");
    expect(await approveChangeRequest(request.id)).toEqual({
      ok: false,
      error: "This climb is already marked as broken on 2026-01-01",
    });
    expect(await climbsInArea(4)).toHaveLength(1);
    expect((await getChangeRequest(db, request.id))?.status).toBe("pending");
  });

  it("refuses an incomplete payload instead of writing blanks", async () => {
    const payload = {
      brokenOn: BROKEN_ON,
      reason: "x",
      successorName: "",
      appendedDescription: "",
      successorDescription: "",
    } as ChangeRequestPayload["climb_break"];
    await expect(
      applyClimbBreak(db, HIGHBALL, payload, {
        type: "climb_break",
        entityId: HIGHBALL,
        payload,
        reviewerId: "break-reviewer",
      }),
    ).rejects.toThrow("This break request is incomplete");
    expect(await climbsInArea(4)).toHaveLength(1);
  });
});

describe("merges and broken climbs", () => {
  it("refuses to merge into or out of a broken climb", async () => {
    await db.update(climbs).set({ brokenOn: BROKEN_ON }).where(eq(climbs.id, HIGHBALL));
    await expect(assertClimbMergeable(db, 2, HIGHBALL)).rejects.toThrow(
      "Can't merge a broken climb",
    );
    await expect(assertClimbMergeable(db, HIGHBALL, 2)).rejects.toThrow(
      "Can't merge a broken climb",
    );
    expect(await requestClimbMerge(2, HIGHBALL)).toEqual({
      ok: false,
      error: "Can't merge a broken climb",
    });
  });
});
