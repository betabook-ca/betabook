import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import { fetchJson } from "@/spa/lib/fetch-json";
import {
  climbListBreadcrumbs,
  climbListItemSamples,
  climbListSamples,
} from "@/stories/fixtures/climb-lists";

import ListsRoute from "./lists-route";

vi.mock("@/spa/lib/navigation", () => import("@/spa/lib/navigation"));
vi.mock("@/spa/lib/actions-client", () => ({}));
vi.mock("@/spa/lib/fetch-json", async (original) => ({
  ...(await original<typeof import("@/spa/lib/fetch-json")>()),
  fetchJson: vi.fn<typeof fetchJson>(),
}));
vi.mock("@/spa/lib/profile-shell", () => ({
  SpaProfileHeader: ({ children }: { children: ReactNode }) => children,
}));

it("opens the full circuit editor after the unfiltered rows arrive", async () => {
  const page = {
    mode: "detail",
    header: { user: { id: "owner", name: "Owner" }, isOwner: true },
    list: climbListSamples[0],
    share: null,
    shareOrigin: "https://example.test",
    page: { items: climbListItemSamples, areaBreadcrumbs: climbListBreadcrumbs },
  };
  let finishLoad!: (value: typeof page) => void;
  const full = new Promise<typeof page>((resolve) => {
    finishLoad = resolve;
  });
  vi.mocked(fetchJson)
    .mockResolvedValueOnce({
      ...page,
      page: { ...page.page, items: climbListItemSamples.slice(2) },
    })
    .mockReturnValueOnce(full);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/users/owner/lists/1?sort=name_asc&name=red&excludeSent=true"]}>
      <Routes>
        <Route path="/users/:id/lists/:listId" element={<ListsRoute viewerId="owner" />} />
      </Routes>
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole("button", { name: "Edit climbs" }));
  expect(vi.mocked(fetchJson).mock.calls.map(([url]) => url)).toEqual([
    "/api/pages/users/owner/lists/1?name=red&sort=name_asc",
    "/api/pages/users/owner/lists/1",
  ]);
  expect(
    screen.queryByRole("button", {
      name: "Remove " + climbListItemSamples[0].name + " from this list",
    }),
  ).not.toBeInTheDocument();
  await act(async () => finishLoad(page));
  expect(
    await screen.findByRole("button", {
      name: "Remove " + climbListItemSamples[0].name + " from this list",
    }),
  ).toBeInTheDocument();
});
