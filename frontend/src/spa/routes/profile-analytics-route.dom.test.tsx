import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import { fetchJson } from "@/spa/lib/fetch-json";

import ProfileAnalyticsRoute from "./profile-analytics-route";

vi.mock("@/spa/lib/navigation", () => import("@/spa/lib/navigation"));
vi.mock("@/spa/lib/actions-client", () => ({}));
vi.mock("@/spa/lib/fetch-json", async (original) => ({
  ...(await original<typeof import("@/spa/lib/fetch-json")>()),
  fetchJson: vi.fn<typeof fetchJson>(),
}));
vi.mock("@/spa/lib/profile-shell", () => ({
  SpaProfileHeader: ({ children }: { children: ReactNode }) => children,
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
