import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsView } from "@/app/users/[id]/projects-view";

type BoardProps = {
  projects: { climbId: number; sessions: { id: number }[] }[];
  hasMore: boolean;
  variant: "open" | "sent";
  suggestions: { climbId: number }[];
  pinnedClimbIds: number[];
  shareOrigin: string;
};

const mocks = vi.hoisted(() => ({
  getPinnedProjects: vi.fn<() => Promise<Array<{ climbId: number }>>>(),
  getPinnedProjectSessions: vi.fn<() => Promise<Array<{ id: number; climbId: number | null }>>>(
    async () => [],
  ),
  getOpenProjectSuggestions: vi.fn<() => Promise<Array<{ climbId: number }>>>(async () => []),
  getPinnedClimbIds: vi.fn<() => Promise<number[]>>(async () => []),
  ProjectBoard: vi.fn<(props: BoardProps) => null>(() => null),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn<() => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/db/queries", () => ({
  getPinnedProjects: mocks.getPinnedProjects,
  getPinnedProjectSessions: mocks.getPinnedProjectSessions,
  getOpenProjectSuggestions: mocks.getOpenProjectSuggestions,
  getPinnedClimbIds: mocks.getPinnedClimbIds,
  OPEN_PROJECT_PAGE_SIZE: 100,
}));

vi.mock("@/components/journal", () => ({
  ProjectBoard: mocks.ProjectBoard,
}));

// The share link's origin comes from the worker's own environment, which this
// view reads so the dialog does not have to guess one on the client.
vi.mock("@/lib/app-url", () => ({ getBaseUrl: async () => "https://betabook.test" }));

const ownerId = "journal-owner";

async function renderBoardProps(variant?: "open" | "sent"): Promise<BoardProps> {
  const result = (await ProjectsView({ ownerId, variant })) as ReactElement<{
    children: ReactNode;
  }>;
  const children = result.props.children as ReactNode[];
  const board = children.find(
    (child) => isValidElement(child) && child.type === mocks.ProjectBoard,
  );
  if (!isValidElement<BoardProps>(board)) throw new Error("ProjectBoard was not rendered");
  return board.props;
}

describe("ProjectsView", () => {
  it.each([0, 3, 100, 101])(
    "renders the correct prefix and overflow flag for %i projects",
    async (count) => {
      const projects = Array.from({ length: count }, (_, index) => ({ climbId: index + 1 }));
      mocks.getPinnedProjects.mockResolvedValue(projects);

      const props = await renderBoardProps();

      expect(props.projects.map(({ climbId }) => ({ climbId }))).toEqual(projects.slice(0, 100));
      expect(props.hasMore).toBe(count > 100);
    },
  );

  it("hands each project only its own preloaded sessions", async () => {
    mocks.getPinnedProjects.mockResolvedValue([{ climbId: 7 }, { climbId: 9 }, { climbId: 11 }]);
    mocks.getPinnedProjectSessions.mockResolvedValue([
      { id: 1, climbId: 9 },
      { id: 2, climbId: 7 },
      { id: 3, climbId: 9 },
      // A training entry has no climb and belongs to no project.
      { id: 4, climbId: null },
    ]);

    const props = await renderBoardProps();

    expect(mocks.getPinnedProjectSessions).toHaveBeenCalledWith({}, ownerId, ownerId, [7, 9, 11]);
    expect(
      props.projects.map((project) => [project.climbId, project.sessions.map(({ id }) => id)]),
    ).toEqual([
      [7, [2]],
      [9, [1, 3]],
      [11, []],
    ]);
  });

  it("reads the unsent side and offers suggestions on the open tab", async () => {
    mocks.getPinnedProjects.mockResolvedValue([]);
    mocks.getOpenProjectSuggestions.mockResolvedValue([{ climbId: 21 }]);

    const props = await renderBoardProps("open");

    expect(mocks.getPinnedProjects).toHaveBeenCalledWith(
      {},
      ownerId,
      ownerId,
      { sent: false },
      101,
    );
    expect(props.variant).toBe("open");
    expect(props.suggestions).toEqual([{ climbId: 21 }]);
  });

  it("hands the dialog every pin, including ones that moved to the sent tab", async () => {
    mocks.getPinnedProjects.mockResolvedValue([{ climbId: 7 }]);
    // 9 is pinned and already sent, so it is absent from this board but must
    // still read as pinned in the search.
    mocks.getPinnedClimbIds.mockResolvedValue([7, 9]);

    const props = await renderBoardProps("open");

    expect(props.pinnedClimbIds).toEqual([7, 9]);
  });

  it("resolves the share origin on the server for both tabs", async () => {
    // A client-built origin would differ between the render and the
    // hydration on a preview domain, and would point at the wrong host.
    for (const variant of ["open", "sent"] as const) {
      expect((await renderBoardProps(variant)).shareOrigin).toBe("https://betabook.test");
    }
  });

  it("reads the sent side and offers nothing to pin there", async () => {
    mocks.getPinnedProjects.mockResolvedValue([]);
    mocks.getOpenProjectSuggestions.mockClear();

    const props = await renderBoardProps("sent");

    expect(mocks.getPinnedProjects).toHaveBeenCalledWith({}, ownerId, ownerId, { sent: true }, 101);
    expect(props.variant).toBe("sent");
    expect(props.suggestions).toEqual([]);
    // Nothing to pin from a list of finished climbs, so the query is skipped.
    expect(mocks.getOpenProjectSuggestions).not.toHaveBeenCalled();
  });
});
