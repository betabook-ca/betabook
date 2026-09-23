import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { climbs, friendships, pinnedProjects, projectShareLinks, user } from "@/db/schema";
import {
  seedFixtureFriendship,
  seedFixtureJournalEntry,
  seedFixturePinnedProject,
  seedFixtureSend,
  seedFixtureTree,
  seedFixtureUser,
} from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getPinnedProjects } from "./journal";
import {
  getProjectShareForOwner,
  getSharedProject,
  getSharedProjectSessions,
} from "./project-shares";

const db = createDb(env.DB);

const OWNER = "owner";
const FRIEND = "friend";
const MEMBER = "member";
const CLIMB = 1;
const OTHER_CLIMB = 2;

async function share(overrides: { expiresAt?: string | null; climbId?: number } = {}) {
  const [row] = await db
    .insert(projectShareLinks)
    .values({
      userId: OWNER,
      climbId: overrides.climbId ?? CLIMB,
      expiresAt: overrides.expiresAt ?? null,
    })
    .returning({ token: projectShareLinks.token });
  return row.token;
}

/** Status and project come back together now, and nearly every case here
 * wants one or the other rather than both. */
const statusOf = async (token: string) => (await getSharedProject(db, token)).status;
const projectOf = async (token: string) => (await getSharedProject(db, token)).project;

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: OWNER, name: "Project Owner", image: "avatars/owner" });
  await seedFixtureUser(db, { id: FRIEND, name: "Friendly Climber" });
  await seedFixtureUser(db, { id: MEMBER, name: "Passing Member" });
  await seedFixtureFriendship(db, OWNER, FRIEND);
  await seedFixturePinnedProject(db, { userId: OWNER, climbId: CLIMB, pinnedAt: "2026-01-20" });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-02-01",
    body: "First look at the crux.",
    tags: ["beta"],
  });
  await seedFixtureJournalEntry(db, {
    userId: OWNER,
    climbId: CLIMB,
    entryDate: "2026-03-05",
    body: "Stuck the crux move.",
  });
});

describe("who can read a link", () => {
  it("opens for anyone holding the token, signed in or not", async () => {
    const token = await share();

    // No audience, so no viewer: the token is the whole permission. Asserted
    // for every kind of reader, because that is the property being claimed.
    const { status, project } = await getSharedProject(db, token);
    expect(status).toBe("visible");
    expect(project?.ownerId).toBe(OWNER);
    expect(project?.ownerName).toBe("Project Owner");
    expect(project?.climbName).toBe("Test Highball");
    expect(project?.sessionCount).toBe(2);
  });

  it("does not depend on friendship either way", async () => {
    const token = await share();

    // A stranger and a friend get the same page; ending the friendship
    // changes nothing, because a link never consulted it.
    const before = await getSharedProject(db, token);
    await db.delete(friendships);
    expect(await getSharedProject(db, token)).toEqual(before);
    expect(before.status).toBe("visible");
  });

  it("stays shut on a token nobody issued", async () => {
    await share();

    expect(await getSharedProject(db, "0".repeat(32))).toEqual({ status: "hidden" });
  });

  it("hides the link while the owner is private, without calling it expired", async () => {
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, OWNER));
    // Written after the profile went private, so the trigger is not what
    // closes this: the read itself has to. A row can only get here through a
    // race between the share write and the privacy write, which is exactly
    // the case the predicate exists to cover.
    const token = await share();

    expect(await getSharedProject(db, token)).toEqual({ status: "hidden" });
    expect(await getSharedProjectSessions(db, token)).toEqual([]);
  });
});

describe("expiry", () => {
  it("reads as expired once the deadline passes, without naming the owner", async () => {
    const token = await share({ expiresAt: "2020-01-01 00:00:00" });

    const access = await getSharedProject(db, token);

    expect(access).toEqual({ status: "expired" });
    // The status read selects the owner's name to decide this, so the point
    // worth pinning is that it never leaves: no project, and no notes.
    expect(JSON.stringify(access)).not.toContain("Project Owner");
    expect(await getSharedProjectSessions(db, token)).toEqual([]);
  });

  it("stays open until then", async () => {
    const token = await share({ expiresAt: "2099-01-01 00:00:00" });

    expect(await statusOf(token)).toBe("visible");
    expect(await projectOf(token)).not.toBeUndefined();
  });

  it("treats a null deadline as no deadline", async () => {
    const token = await share({ expiresAt: null });

    expect(await statusOf(token)).toBe("visible");
  });
});

describe("what a link reaches", () => {
  it("returns the sessions for its own climb and nothing from another", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: OTHER_CLIMB,
      entryDate: "2026-04-01",
      body: "A different climb entirely.",
    });
    const token = await share({ climbId: CLIMB });

    const sessions = await getSharedProjectSessions(db, token);

    expect(sessions).toEqual([
      {
        id: expect.any(Number),
        entryDate: "2026-03-05",
        body: "Stuck the crux move.",
        tags: [],
      },
      {
        id: expect.any(Number),
        entryDate: "2026-02-01",
        body: "First look at the crux.",
        tags: ["beta"],
      },
    ]);
  });

  it("carries send commentary, which the owner's own card also counts", async () => {
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-20",
      body: "Retained send comment.",
      isSendComment: true,
    });
    const token = await share();

    const sessions = await getSharedProjectSessions(db, token);
    const project = await projectOf(token);

    expect(sessions.map((session) => session.entryDate)).toEqual([
      "2026-03-20",
      "2026-03-05",
      "2026-02-01",
    ]);
    expect(sessions.some((session) => session.body === "Retained send comment.")).toBe(true);
    expect(project?.sessionCount).toBe(3);
    expect(project?.lastSession).toBe("2026-03-20");
  });

  it("counts exactly what the owner's own card counts", async () => {
    // The two used to disagree: the share page filtered send commentary out
    // of a count the owner's board leaves in, so a project could read N on
    // the card and N-1 on the page it links to.
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-20",
      body: "Retained send comment.",
      isSendComment: true,
    });
    const token = await share();

    const project = await projectOf(token);
    const [card] = await getPinnedProjects(db, OWNER, OWNER, { sent: false });

    expect(project?.sessionCount).toBe(card.sessionCount);
    expect(project?.firstSession).toBe(card.firstSession);
    expect(project?.lastSession).toBe(card.lastSession);
  });

  it("reports the send whole, exact date and all", async () => {
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: CLIMB,
      dateSent: "2026-03-14",
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 9,
      gradeFeel: "high",
      comment: "Felt a grade harder than the book says.",
    });
    const token = await share();

    const project = await projectOf(token);

    expect(project).toMatchObject({
      sent: true,
      sentOn: "2026-03-14",
      ascentStyle: "flash",
      rating: 4,
      suggestedGrade: 9,
      gradeFeel: "high",
      sendComment: "Felt a grade harder than the book says.",
    });
  });

  it("lists the ascent entry at the send's own date", async () => {
    // The ascent mirrors the send's date and comment, which the journal/send
    // invariant enforces on insert. Both now travel: a link publishes the
    // send, so hiding the note attached to it would withhold the entry a
    // reader most expects to find.
    const sentNote = "Sent it first go after the rest day.";
    await seedFixtureSend(db, {
      userId: OWNER,
      climbId: CLIMB,
      dateSent: "2026-03-14",
      comment: sentNote,
    });
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-14",
      isAscent: true,
      sent: true,
      body: sentNote,
    });
    const token = await share();

    const sessions = await getSharedProjectSessions(db, token);
    const project = await projectOf(token);

    expect(sessions[0]).toMatchObject({ entryDate: "2026-03-14", body: sentNote });
    expect(project?.sentOn).toBe("2026-03-14");
  });

  it("keeps an unsent, never-climbed pin readable", async () => {
    await db.delete(pinnedProjects).where(eq(pinnedProjects.climbId, CLIMB));
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    const project = await projectOf(token);

    expect(project).toMatchObject({
      sessionCount: 0,
      firstSession: null,
      lastSession: null,
      sent: false,
      sentOn: null,
    });
  });
});

describe("the link cannot outlive the pin", () => {
  it("dies with the pin", async () => {
    const token = await share();

    await db.delete(pinnedProjects).where(eq(pinnedProjects.userId, OWNER));

    expect(await db.select().from(projectShareLinks).all()).toEqual([]);
    expect(await statusOf(token)).toBe("hidden");
  });

  it("dies with the climb", async () => {
    // A climb carrying journal entries cannot be deleted at all, so this uses
    // a bare pin — the case where deleting the climb is actually reachable.
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    await db.delete(climbs).where(eq(climbs.id, OTHER_CLIMB));

    expect(await statusOf(token)).toBe("hidden");
  });

  it("dies with the account", async () => {
    const token = await share();

    await db.delete(user).where(eq(user.id, OWNER));

    expect(await statusOf(token)).toBe("hidden");
  });

  it("dies when the owner goes private", async () => {
    await share();

    await db.update(user).set({ isPrivate: true }).where(eq(user.id, OWNER));

    expect(await db.select().from(projectShareLinks).all()).toEqual([]);
  });
});

describe("the owner's own view", () => {
  it("rides along on the owner's board so a card can show its own link", async () => {
    const token = await share({ expiresAt: "2099-01-01 00:00:00" });
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });

    const projects = await getPinnedProjects(db, OWNER, OWNER, { sent: false });

    const shared = projects.find((project) => project.climbId === CLIMB);
    const unshared = projects.find((project) => project.climbId === OTHER_CLIMB);
    expect(shared?.share).toEqual({ token, expiresAt: "2099-01-01 00:00:00" });
    expect(unshared?.share).toBeNull();
  });

  it("hands back the settings for their link", async () => {
    const token = await share({ expiresAt: "2099-01-01 00:00:00" });

    expect(await getProjectShareForOwner(db, OWNER, CLIMB)).toEqual({
      token,
      expiresAt: "2099-01-01 00:00:00",
    });
  });

  it("hands nothing to another climber", async () => {
    await share();

    expect(await getProjectShareForOwner(db, MEMBER, CLIMB)).toBeNull();
  });

  it("does not resolve a token against the wrong climb", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    const project = await projectOf(token);

    expect(project?.climbId).toBe(OTHER_CLIMB);
    expect(project?.climbName).toBe("Test Slab");
  });
});
