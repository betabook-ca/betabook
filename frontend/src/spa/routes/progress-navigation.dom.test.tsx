import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import { fetchJson } from "@/spa/lib/fetch-json";

import AdminRequestsRoute from "./admin-requests-route";
import ProjectsRoute from "./projects-route";
import TripsRoute from "./trips-route";

vi.unmock("@/spa/lib/router-link");
vi.mock("@/spa/lib/fetch-json", async (original) => ({
  ...(await original<typeof import("@/spa/lib/fetch-json")>()),
  fetchJson: vi.fn<typeof fetchJson>(),
}));

it("keeps the Projects navigation and filter while switching between open and sent boards", async () => {
  const empty = { projects: [], suggestions: [], hasMore: false, pinnedClimbIds: [] };
  let resolveBoard!: (board: typeof empty) => void;
  const response = new Promise<typeof empty>((resolve) => {
    resolveBoard = resolve;
  });
  vi.mocked(fetchJson).mockResolvedValueOnce(empty).mockReturnValueOnce(response);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/users/owner/projects"]}>
      <Routes>
        <Route path="/users/:id/projects" element={<ProjectsRoute viewerId="owner" />} />
        <Route path="/users/:id/projects/sent" element={<ProjectsRoute viewerId="owner" sent />} />
      </Routes>
    </MemoryRouter>,
  );
  const input = await screen.findByRole("searchbox", { name: "Filter projects" });
  await user.type(input, "granite");
  const tabs = screen.getByRole("navigation", { name: "Project lists" });
  await user.click(screen.getByRole("link", { name: "Sent" }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("navigation", { name: "Project lists" })).toBe(tabs);
  expect(screen.getByRole("searchbox", { name: "Filter projects" })).toBe(input);
  expect(input).toHaveValue("granite");
  await act(async () => resolveBoard(empty));
  expect(await screen.findByText(/No sent projects yet/)).toBeVisible();
});

it("retains a trip's heading across a detail-to-analytics request and drops it for another viewer", async () => {
  const detail = {
    header: { isOwner: true, user: { id: "owner", name: "Owner" }, access: { journal: true } },
    trip: {
      id: 1,
      name: "Weekend trip",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      description: null,
      albumUrl: "https://photos.app.goo.gl/abcdef",
      entryCount: 1,
      sendCount: 1,
      dayCount: 1,
      hasNotes: 0,
      companions: [],
    },
    notes: null,
    notesHtml: null,
    share: null,
    timezone: "UTC",
    view: {
      rows: {
        entries: ["2025-01-01", "2025-01-02"].map((entryDate, index) => ({
          id: index + 1,
          kind: "training",
          entryDate,
          sent: false,
          body: "Training on " + entryDate,
          tags: [],
          companions: [],
          climbId: null,
          areaId: null,
          isAscent: false,
          isSendComment: false,
        })),
        sends: [],
        sendsCapped: false,
        entriesCapped: false,
      },
      breadcrumbs: {},
    },
  };
  vi.mocked(fetchJson)
    .mockResolvedValueOnce(detail)
    .mockResolvedValueOnce([])
    .mockReturnValue(new Promise(() => {}));
  const view = (viewer: string) => (
    <MemoryRouter initialEntries={["/users/owner/trips/1"]}>
      <Routes>
        <Route path="/users/:id/trips/:tripId" element={<TripsRoute viewerId={viewer} />} />
        <Route
          path="/users/:id/trips/:tripId/analytics"
          element={<TripsRoute viewerId={viewer} />}
        />
      </Routes>
    </MemoryRouter>
  );
  const { rerender } = render(view("owner"));
  const heading = await screen.findByRole("heading", { name: "Weekend trip" });
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
  await userEvent.setup().click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(screen.getByRole("button", { name: "Sort descending" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Weekend trip" })).toBe(heading);
  expect(fetchJson).toHaveBeenCalledTimes(2);
  await userEvent.setup().click(screen.getByRole("link", { name: "Analytics" }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("heading", { name: "Weekend trip" })).toBe(heading);
  rerender(view("stranger"));
  expect(screen.queryByRole("heading", { name: "Weekend trip" })).not.toBeInTheDocument();
});

it("keeps the review queue heading during cursor navigation and clears the queue on forbidden", async () => {
  const data = {
    managedAreas: [],
    rows: [],
    hasPrevious: false,
    nextHref: "/admin/requests?after=4&at=100",
  };
  let forbid!: (error: Error) => void;
  const next = new Promise<never>((_, reject) => {
    forbid = reject;
  });
  vi.mocked(fetchJson).mockResolvedValueOnce(data).mockReturnValueOnce(next);
  render(
    <MemoryRouter initialEntries={["/admin/requests"]}>
      <Routes>
        <Route path="/admin/requests" element={<AdminRequestsRoute viewerId="admin" />} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  const header = await screen.findByRole("heading", { name: "Review requests" });
  await userEvent.setup().click(screen.getByRole("link", { name: "Next requests" }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("heading", { name: "Review requests" })).toBe(header);
  await act(async () => forbid(Object.assign(new Error("Forbidden"), { status: 403 })));
  expect(await screen.findByText("Home")).toBeVisible();
  expect(header).not.toBeInTheDocument();
});
