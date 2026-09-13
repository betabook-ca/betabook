import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectsView } from "@/app/users/[id]/projects-view";

type BoardProps = { projects: { climbId: number; sessions: { id: number }[] }[]; hasMore: boolean };

const mocks = vi.hoisted(() => ({
  getOpenProjects: vi.fn<() => Promise<Array<{ climbId: number }>>>(),
  getOpenProjectSessions: vi.fn<() => Promise<Array<{ id: number; climbId: number | null }>>>(
    async () => [],
  ),
  ProjectBoard: vi.fn<(props: BoardProps) => null>(() => null),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn<() => Promise<Record<string, never>>>(async () => ({})),
}));

vi.mock("@/db/queries", () => ({
  getOpenProjects: mocks.getOpenProjects,
  getOpenProjectSessions: mocks.getOpenProjectSessions,
  OPEN_PROJECT_PAGE_SIZE: 100,
}));

vi.mock("@/components/journal", () => ({
  ProjectBoard: mocks.ProjectBoard,
}));

const ownerId = "journal-owner";

async function renderBoardProps(): Promise<BoardProps> {
  const result = (await ProjectsView({ ownerId })) as ReactElement<{ children: ReactNode }>;
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
      mocks.getOpenProjects.mockResolvedValue(projects);

      const props = await renderBoardProps();

      expect(props.projects.map(({ climbId }) => ({ climbId }))).toEqual(projects.slice(0, 100));
      expect(props.hasMore).toBe(count > 100);
    },
  );

  it("hands each project only its own preloaded sessions", async () => {
    mocks.getOpenProjects.mockResolvedValue([{ climbId: 7 }, { climbId: 9 }, { climbId: 11 }]);
    mocks.getOpenProjectSessions.mockResolvedValue([
      { id: 1, climbId: 9 },
      { id: 2, climbId: 7 },
      { id: 3, climbId: 9 },
      // A training entry has no climb and belongs to no project.
      { id: 4, climbId: null },
    ]);

    const props = await renderBoardProps();

    expect(mocks.getOpenProjectSessions).toHaveBeenCalledWith({}, ownerId, ownerId, [7, 9, 11]);
    expect(
      props.projects.map((project) => [project.climbId, project.sessions.map(({ id }) => id)]),
    ).toEqual([
      [7, [2]],
      [9, [1, 3]],
      [11, []],
    ]);
  });
});
