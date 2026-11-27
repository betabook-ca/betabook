import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { fetchJson } from "@/spa/lib/fetch-json";
import { stubViewport } from "@/tests/vitest/viewport";

import ProfileAnalyticsRoute from "./profile-analytics-route";

afterEach(() => vi.unstubAllGlobals());

vi.mock("@/spa/lib/navigation", () => import("@/spa/lib/navigation"));
vi.mock("@/spa/lib/actions-client", () => ({
  dismissFeatureAnnouncement:
    vi.fn<typeof import("@/spa/lib/actions-client").dismissFeatureAnnouncement>(),
  saveAnalyticsLayout: vi.fn<typeof import("@/spa/lib/actions-client").saveAnalyticsLayout>(),
}));
vi.mock("@/spa/lib/fetch-json", async (original) => ({
  ...(await original<typeof import("@/spa/lib/fetch-json")>()),
  fetchJson: vi.fn<typeof fetchJson>(),
}));

it("keeps the tag input mounted during filtering and clears previous results for a different viewer", async () => {
  const payload = {
    header: { user: { id: "owner" }, isOwner: false, access: { journal: true } },
    rows: [],
    highlightSessions: [],
    tags: ["project"],
    showAnnouncement: false,
  };
  let finishLoad!: (value: typeof payload) => void;
  const load = new Promise<typeof payload>((resolve) => {
    finishLoad = resolve;
  });
  vi.mocked(fetchJson)
    .mockResolvedValueOnce(payload)
    .mockReturnValueOnce(load)
    .mockReturnValueOnce(new Promise(() => {}));
  const page = (viewerId: string) => (
    <MemoryRouter initialEntries={["/users/owner/analytics"]}>
      <Routes>
        <Route
          path="/users/:id/analytics"
          element={<ProfileAnalyticsRoute viewerId={viewerId} />}
        />
      </Routes>
    </MemoryRouter>
  );
  const user = userEvent.setup();
  const { rerender } = render(page("first-viewer"));
  await user.click(await screen.findByRole("button", { name: "Expand filters" }));
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "project{Enter}");
  await waitFor(() =>
    expect(vi.mocked(fetchJson).mock.calls.map(([url]) => url)).toContain(
      "/api/pages/users/owner/analytics?tag=project",
    ),
  );
  expect(input).toHaveFocus();
  expect(screen.getByRole("combobox", { name: "Tags" })).toBe(input);
  await act(async () => finishLoad(payload));
  expect(screen.getByRole("combobox", { name: "Tags" })).toBe(input);
  rerender(page("different-viewer"));
  expect(screen.queryByRole("combobox", { name: "Tags" })).not.toBeInTheDocument();
  expect(screen.queryByText("Nothing matches these tags.")).not.toBeInTheDocument();
});

it("keeps the tag disclosure and input when filtering changes a populated dashboard to empty", async () => {
  stubViewport("desktop");
  const base = {
    header: { user: { id: "owner", name: "Owner" }, isOwner: false, access: { journal: true } },
    tags: ["project"],
    highlightSessions: [],
    showAnnouncement: false,
    overview: {
      sendCount: 1,
      areaCount: 1,
      firstYear: 2025,
      daysOut: 1,
      lastOut: "2025-01-03",
      daysThisMonth: 0,
      month: "2026-11",
    },
    nowMs: Date.UTC(2026, 10, 26),
    viewerCreatedAt: 0,
    layout: null,
  };
  vi.mocked(fetchJson)
    .mockResolvedValueOnce({
      ...base,
      rows: [
        {
          climbId: 1,
          climbType: "boulder",
          suggestedGrade: 2,
          areaId: 1,
          areaName: "Area",
          climbName: "Climb",
          ascentStyle: "flash",
          dateSent: "2025-01-03",
        },
      ],
    })
    .mockResolvedValueOnce({ ...base, rows: [] });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/users/owner/analytics"]}>
      <Routes>
        <Route path="/users/:id/analytics" element={<ProfileAnalyticsRoute viewerId="visitor" />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole("button", { name: "Expand filters" }));
  const input = screen.getByRole("combobox", { name: "Tags" });
  await user.type(input, "project{Enter}");
  expect(await screen.findByText("Nothing matches these tags.")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Tags" })).toBe(input);
  expect(input).toHaveFocus();
});
