import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UserPage from "@/app/users/[id]/page";
import UserProjectsPage from "@/app/users/[id]/projects/page";
import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { seedFixtureFriendship, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const OWNER = "journal-owner";
const state = vi.hoisted(() => ({ viewer: null as string | null }));

const mocks = vi.hoisted(() => ({
  JournalView: vi.fn<(props: unknown) => null>(() => null),
  ProjectsView: vi.fn<(props: unknown) => null>(() => null),
  SendsView: vi.fn<(props: unknown) => null>(() => null),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

vi.mock("@/lib/session", () => ({
  getMemberSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

// Only the header is presentation; the resolver and its lookups stay real so
// canReadJournal's SQL decides which view the page renders.
vi.mock("@/app/users/[id]/profile-shell", async (original) => ({
  ...(await original<typeof import("@/app/users/[id]/profile-shell")>()),
  ProfileHeader: () => null,
}));

vi.mock("@/app/users/[id]/journal-view", () => ({ JournalView: mocks.JournalView }));
vi.mock("@/app/users/[id]/sends-view", () => ({ SendsView: mocks.SendsView }));
vi.mock("@/app/users/[id]/projects-view", () => ({ ProjectsView: mocks.ProjectsView }));

const db = createDb(env.DB);

function viewFrom(result: ReactElement<{ children: ReactNode }>) {
  return result.props.children as ReactElement<Record<string, unknown>>;
}

const page = (search: Record<string, string> = {}) =>
  UserPage({ params: Promise.resolve({ id: OWNER }), searchParams: Promise.resolve(search) });

beforeEach(async () => {
  state.viewer = null;
  await resetDb(db);
  await seedFixtureUser(db, { id: OWNER, journalVisibility: "friends" });
  await seedFixtureUser(db, { id: "friend" });
  await seedFixtureUser(db, { id: "requester" });
  await seedFixtureUser(db, { id: "stranger" });
  await seedFixtureFriendship(db, "friend", OWNER, "accepted");
  await seedFixtureFriendship(db, "requester", OWNER, "pending");
});

describe("the profile's default view", () => {
  it("renders the journal for its owner", async () => {
    state.viewer = OWNER;

    const view = viewFrom(await page({ view: "training" }));

    expect(view.type).toBe(mocks.JournalView);
    expect(view.props.filter).toMatchObject({ view: "training" });
  });

  it("renders a friends-only journal for an accepted friend", async () => {
    state.viewer = "friend";

    const view = viewFrom(await page());

    expect(view.type).toBe(mocks.JournalView);
    expect(view.props).toMatchObject({ ownerId: OWNER, viewerId: "friend" });
  });

  it.each(["requester", "stranger"])(
    "keeps the existing send list as the fallback for a %s",
    async (viewer) => {
      state.viewer = viewer;

      const view = viewFrom(await page({ sort: "grade_desc" }));

      expect(view.type).toBe(mocks.SendsView);
      expect(view.props).toMatchObject({
        userId: OWNER,
        viewerId: viewer,
        basePath: `/users/${OWNER}`,
      });
      expect(view.props.filter).toMatchObject({ sort: "grade_desc" });
    },
  );

  it("keeps a private journal from an accepted friend", async () => {
    await db.update(user).set({ journalVisibility: "private" }).where(eq(user.id, OWNER));
    state.viewer = "friend";

    expect(viewFrom(await page()).type).toBe(mocks.SendsView);
  });

  it("renders a member-shared journal for a signed-in stranger", async () => {
    await db.update(user).set({ journalVisibility: "public" }).where(eq(user.id, OWNER));
    state.viewer = "stranger";

    expect(viewFrom(await page()).type).toBe(mocks.JournalView);
  });
});

describe("the Projects page", () => {
  it("renders open projects for the owner", async () => {
    state.viewer = OWNER;

    const result = await UserProjectsPage({ params: Promise.resolve({ id: OWNER }) });

    expect(viewFrom(result).type).toBe(mocks.ProjectsView);
  });

  it("is unavailable to visitors, friends included", async () => {
    state.viewer = "friend";

    await expect(UserProjectsPage({ params: Promise.resolve({ id: OWNER }) })).rejects.toThrow(
      "not found",
    );
  });
});
