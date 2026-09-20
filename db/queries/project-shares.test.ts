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
  getProjectShareAccess,
  getProjectShareForOwner,
  getProjectShareTokens,
  getSharedProject,
  getSharedProjectSessions,
} from "./project-shares";

const db = createDb(env.DB);

const OWNER = "owner";
const FRIEND = "friend";
const MEMBER = "member";
const CLIMB = 1;
const OTHER_CLIMB = 2;

type Audience = "everyone" | "public" | "friends";

async function share(
  overrides: { audience?: Audience; expiresAt?: string | null; climbId?: number } = {},
) {
  const [row] = await db
    .insert(projectShareLinks)
    .values({
      userId: OWNER,
      climbId: overrides.climbId ?? CLIMB,
      audience: overrides.audience ?? "everyone",
      expiresAt: overrides.expiresAt ?? null,
    })
    .returning({ token: projectShareLinks.token });
  return row.token;
}

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

describe("audience", () => {
  it("lets a signed-out reader open an everyone link", async () => {
    const token = await share({ audience: "everyone" });

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "visible" });
    const project = await getSharedProject(db, token, null);
    expect(project?.ownerName).toBe("Project Owner");
    expect(project?.climbName).toBe("Test Highball");
    expect(project?.sessionCount).toBe(2);
  });

  it.each([
    ["public", MEMBER, true],
    ["public", null, false],
    ["friends", FRIEND, true],
    ["friends", MEMBER, false],
    ["friends", null, false],
  ] as const)("resolves a %s link for %s", async (audience, viewerId, allowed) => {
    const token = await share({ audience });

    const access = await getProjectShareAccess(db, token, viewerId);
    expect(access.status).toBe(
      allowed ? "visible" : viewerId === null ? "needs-sign-in" : "hidden",
    );
    expect(await getSharedProject(db, token, viewerId)).toEqual(
      allowed ? expect.objectContaining({ climbId: CLIMB }) : null,
    );
  });

  it("stops naming the owner once the friendship ends", async () => {
    const token = await share({ audience: "friends" });
    expect(await getSharedProject(db, token, FRIEND)).not.toBeNull();

    await db.delete(friendships);

    expect(await getProjectShareAccess(db, token, FRIEND)).toEqual({ status: "hidden" });
    expect(await getSharedProject(db, token, FRIEND)).toBeNull();
    expect(await getSharedProjectSessions(db, token, FRIEND)).toEqual([]);
  });

  it("grants nothing on a pending friend request", async () => {
    await db.delete(friendships);
    await seedFixtureFriendship(db, OWNER, FRIEND, "pending");
    const token = await share({ audience: "friends" });

    expect(await getSharedProject(db, token, FRIEND)).toBeNull();
  });

  it("hides the link while the owner is private, even from the owner", async () => {
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, OWNER));
    // Written after the profile went private, so the trigger is not what
    // closes this: the read itself has to. A row can only get here through a
    // race between the share write and the privacy write, which is exactly
    // the case the predicate exists to cover.
    const token = await share({ audience: "everyone" });

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "needs-sign-in" });
    expect(await getProjectShareAccess(db, token, OWNER)).toEqual({ status: "hidden" });
    expect(await getSharedProject(db, token, null)).toBeNull();
    expect(await getSharedProject(db, token, OWNER)).toBeNull();
    expect(await getSharedProjectSessions(db, token, OWNER)).toEqual([]);
  });
});

describe("expiry", () => {
  it("reads as expired once the deadline passes, without naming the owner", async () => {
    const token = await share({ expiresAt: "2020-01-01 00:00:00" });

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "expired" });
    expect(await getSharedProject(db, token, null)).toBeNull();
    expect(await getSharedProjectSessions(db, token, null)).toEqual([]);
  });

  it("stays open until then", async () => {
    const token = await share({ expiresAt: "2099-01-01 00:00:00" });

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "visible" });
    expect(await getSharedProject(db, token, null)).not.toBeNull();
  });

  it("tells only a reader who would be let in, and 404s the rest", async () => {
    const token = await share({ audience: "friends", expiresAt: "2020-01-01 00:00:00" });

    expect(await getProjectShareAccess(db, token, FRIEND)).toEqual({ status: "expired" });
    // A signed-in stranger learns nothing, not even that the link expired.
    expect(await getProjectShareAccess(db, token, MEMBER)).toEqual({ status: "hidden" });
  });

  it("treats a null deadline as no deadline", async () => {
    const token = await share({ expiresAt: null });

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "visible" });
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

    const sessions = await getSharedProjectSessions(db, token, null);

    expect(sessions).toEqual([
      { entryDate: "2026-03-05", body: "Stuck the crux move.", tags: [] },
      { entryDate: "2026-02-01", body: "First look at the crux.", tags: ["beta"] },
    ]);
  });

  it("leaves out send-comment rows, which a merge can date to the merge itself", async () => {
    await seedFixtureJournalEntry(db, {
      userId: OWNER,
      climbId: CLIMB,
      entryDate: "2026-03-20",
      body: "Retained send comment.",
      isSendComment: true,
    });
    const token = await share();

    const sessions = await getSharedProjectSessions(db, token, null);
    const project = await getSharedProject(db, token, null);

    expect(sessions.map((session) => session.entryDate)).toEqual(["2026-03-05", "2026-02-01"]);
    expect(sessions.every((session) => session.body !== "Retained send comment.")).toBe(true);
    expect(project?.sessionCount).toBe(2);
    expect(project?.lastSession).toBe("2026-03-05");
  });

  it("reports a send by month only, never by date", async () => {
    await seedFixtureSend(db, { userId: OWNER, climbId: CLIMB, dateSent: "2026-03-14" });
    const token = await share();

    const project = await getSharedProject(db, token, null);

    expect(project?.sent).toBe(true);
    expect(project?.sentMonth).toBe("2026-03");
    expect(JSON.stringify(project)).not.toContain("2026-03-14");
  });

  it("keeps an unsent, never-climbed pin readable", async () => {
    await db.delete(pinnedProjects).where(eq(pinnedProjects.climbId, CLIMB));
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    const project = await getSharedProject(db, token, null);

    expect(project).toMatchObject({ sessionCount: 0, firstSession: null, lastSession: null });
    expect(project?.sent).toBe(false);
  });
});

describe("the link cannot outlive the pin", () => {
  it("dies with the pin", async () => {
    const token = await share();

    await db.delete(pinnedProjects).where(eq(pinnedProjects.userId, OWNER));

    expect(await db.select().from(projectShareLinks).all()).toEqual([]);
    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "hidden" });
  });

  it("dies with the climb", async () => {
    // A climb carrying journal entries cannot be deleted at all, so this uses
    // a bare pin — the case where deleting the climb is actually reachable.
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    await db.delete(climbs).where(eq(climbs.id, OTHER_CLIMB));

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "hidden" });
  });

  it("dies with the account", async () => {
    const token = await share();

    await db.delete(user).where(eq(user.id, OWNER));

    expect(await getProjectShareAccess(db, token, null)).toEqual({ status: "hidden" });
  });

  it("dies when the owner goes private", async () => {
    await share();

    await db.update(user).set({ isPrivate: true }).where(eq(user.id, OWNER));

    expect(await getProjectShareTokens(db, OWNER)).toEqual([]);
  });
});

describe("the owner's own view", () => {
  it("rides along on the owner's board so a card can show its own link", async () => {
    const token = await share({ audience: "friends", expiresAt: "2099-01-01 00:00:00" });
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });

    const projects = await getPinnedProjects(db, OWNER, OWNER, { sent: false });

    const shared = projects.find((project) => project.climbId === CLIMB);
    const unshared = projects.find((project) => project.climbId === OTHER_CLIMB);
    expect(shared?.share).toEqual({
      token,
      audience: "friends",
      expiresAt: "2099-01-01 00:00:00",
    });
    expect(unshared?.share).toBeNull();
  });

  it("hands back the settings for their link", async () => {
    const token = await share({ audience: "friends", expiresAt: "2099-01-01 00:00:00" });

    expect(await getProjectShareForOwner(db, OWNER, CLIMB)).toEqual({
      token,
      audience: "friends",
      expiresAt: "2099-01-01 00:00:00",
    });
  });

  it("hands nothing to another climber", async () => {
    await share();

    expect(await getProjectShareForOwner(db, MEMBER, CLIMB)).toBeNull();
    expect(await getProjectShareTokens(db, MEMBER)).toEqual([]);
  });

  it("does not resolve a token against the wrong climb", async () => {
    await seedFixturePinnedProject(db, { userId: OWNER, climbId: OTHER_CLIMB });
    const token = await share({ climbId: OTHER_CLIMB });

    const project = await getSharedProject(db, token, null);

    expect(project?.climbId).toBe(OTHER_CLIMB);
    expect(project?.climbName).toBe("Test Slab");
  });
});
