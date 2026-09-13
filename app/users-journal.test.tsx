import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UserPage from "@/app/users/[id]/page";
import UserProjectsPage from "@/app/users/[id]/projects/page";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  user: {
    id: "journal-owner",
    name: "Journal Owner",
    email: "owner@example.com",
    emailVerified: true,
    image: null as string | null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    welcomeEmailSentAt: null as Date | null,
    isPrivate: false,
    journalVisibility: "private",
  },
}));

const mocks = vi.hoisted(() => ({
  JournalView: vi.fn<(props: unknown) => null>(() => null),
  ProfileHeader: vi.fn<(props: unknown) => null>(() => null),
  ProjectsView: vi.fn<(props: unknown) => null>(() => null),
  SendsView: vi.fn<(props: unknown) => null>(() => null),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn<() => never>(() => {
    throw new Error("not found");
  }),
}));

vi.mock("@/lib/session", () => ({
  getMemberSession: vi.fn<() => Promise<{ user: { id: string } } | null>>(
    async () => state.session,
  ),
}));

vi.mock("@/app/users/[id]/profile-shell", () => ({
  getUserById: vi.fn<(id: string) => Promise<typeof state.user>>(async () => state.user),
  canReadUserJournal: async (_id: string, viewerId: string | null) =>
    state.user.journalVisibility === "public" || state.user.id === viewerId,
  ProfileHeader: mocks.ProfileHeader,
}));

vi.mock("@/app/users/[id]/journal-view", () => ({
  JournalView: mocks.JournalView,
}));

vi.mock("@/app/users/[id]/sends-view", () => ({
  SendsView: mocks.SendsView,
}));

vi.mock("@/app/users/[id]/projects-view", () => ({
  ProjectsView: mocks.ProjectsView,
}));

function viewFrom(result: ReactElement<{ children: ReactNode }>) {
  return result.props.children as ReactElement<Record<string, unknown>>;
}

describe("the profile's default view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = null;
    state.user.isPrivate = false;
    state.user.journalVisibility = "private";
  });

  it("renders the journal for its owner", async () => {
    state.session = { user: { id: state.user.id } };

    const result = await UserPage({
      params: Promise.resolve({ id: state.user.id }),
      searchParams: Promise.resolve({ view: "training" }),
    });

    const view = viewFrom(result);
    expect(view.type).toBe(mocks.JournalView);
    expect(view.props.filter).toMatchObject({ view: "training" });
  });

  it("keeps the existing send list as the fallback for a visitor", async () => {
    state.session = { user: { id: "visitor" } };

    const result = await UserPage({
      params: Promise.resolve({ id: state.user.id }),
      searchParams: Promise.resolve({ sort: "grade_desc" }),
    });

    const view = viewFrom(result);
    expect(view.type).toBe(mocks.SendsView);
    expect(view.props).toMatchObject({
      userId: state.user.id,
      viewerId: "visitor",
      basePath: `/users/${state.user.id}`,
    });
    expect(view.props.filter).toMatchObject({ sort: "grade_desc" });
  });

  it("renders a member-shared journal for a signed-in visitor", async () => {
    state.session = { user: { id: "visitor" } };
    state.user.journalVisibility = "public";

    const result = await UserPage({
      params: Promise.resolve({ id: state.user.id }),
      searchParams: Promise.resolve({}),
    });

    expect(viewFrom(result).type).toBe(mocks.JournalView);
  });
});

describe("the Projects page", () => {
  it("renders open projects for the owner", async () => {
    state.session = { user: { id: state.user.id } };

    const result = await UserProjectsPage({ params: Promise.resolve({ id: state.user.id }) });

    expect(viewFrom(result).type).toBe(mocks.ProjectsView);
  });

  it("is unavailable to visitors", async () => {
    state.session = { user: { id: "visitor" } };

    await expect(
      UserProjectsPage({ params: Promise.resolve({ id: state.user.id }) }),
    ).rejects.toThrow("not found");
  });
});
