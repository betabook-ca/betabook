import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";

import { fetchJson } from "@/spa/lib/fetch-json";
import FeedRoute from "@/spa/routes/feed-route";
import FriendsRoute from "@/spa/routes/friends-route";

vi.unmock("@/spa/lib/router-link");
vi.mock("@/spa/lib/fetch-json", () => ({ fetchJson: vi.fn<typeof fetchJson>() }));
vi.mock("@/hooks/use-client-session", () => ({
  useClientSession: () => ({ user: { id: "owner" } }),
}));

beforeEach(() => {
  vi.mocked(fetchJson).mockReset();
});

it("keeps the feed pills and current rows while switching views and ignores superseded reads", async () => {
  const user = userEvent.setup();
  const fetcher = vi.mocked(fetchJson);
  const initial = { view: "all", page: { days: [], hasMore: false }, hasFriends: true };
  fetcher.mockResolvedValueOnce(initial);
  let finish!: (page: typeof initial.page) => void;
  fetcher.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <MemoryRouter initialEntries={["/feed"]}>
      <FeedRoute viewerId="owner" />
    </MemoryRouter>,
  );
  const previous = await screen.findByText("No activity to show yet.");
  const nav = screen.getByRole("navigation", { name: "Feed activity" });
  const sends = within(nav).getByRole("link", { name: "Sends" });
  await user.click(sends);
  expect(screen.getByRole("navigation", { name: "Feed activity" })).toBe(nav);
  expect(sends).toHaveFocus();
  expect(sends).toHaveAttribute("aria-current", "page");
  expect(previous.closest('[aria-busy="true"]')).not.toBeNull();
  const next = fetcher.mock.calls.find(([url]) => url === "/api/feed?view=sends");
  expect(next).toBeDefined();
  await user.click(within(nav).getByRole("link", { name: "All activity" }));
  expect(next?.[1]?.signal?.aborted).toBe(true);
  await act(async () => finish({ days: [], hasMore: false }));
  expect(screen.getByText("No activity to show yet.")).toBe(previous);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps the friends workspace when changing tabs and discards old rows on viewer changes", async () => {
  const user = userEvent.setup();
  const fetcher = vi.mocked(fetchJson);
  const friends = { view: "friends", page: { friends: [], hasMore: false }, suggestions: [] };
  fetcher.mockResolvedValueOnce(friends);
  let finish!: (page: unknown) => void;
  fetcher.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const page = (viewer: string) => (
    <MemoryRouter initialEntries={["/friends"]}>
      <FriendsRoute viewerId={viewer} />
    </MemoryRouter>
  );
  const { rerender } = render(page("owner"));
  const nav = screen.getByRole("navigation", { name: "Friend lists" });
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  const requests = within(nav).getByRole("link", { name: "Requests" });
  await user.click(requests);
  expect(screen.getByRole("navigation", { name: "Friend lists" })).toBe(nav);
  expect(requests).toHaveFocus();
  expect(requests).toHaveAttribute("aria-current", "page");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "/api/pages/friends?view=friends",
    "/api/friends?view=requests",
  ]);
  await act(async () =>
    finish({
      friends: [
        {
          id: "incoming",
          name: "Private test member",
          image: null,
          isPrivate: false,
          friendshipStatus: "incoming",
        },
      ],
      hasMore: false,
    }),
  );
  expect(screen.getByText("Private test member")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Friend lists" })).toBe(nav);
  fetcher.mockReturnValueOnce(new Promise(() => {}));
  rerender(page("different-owner"));
  expect(screen.queryByText("Private test member")).not.toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Friend lists" })).toBeInTheDocument();
  expect(screen.getByText("Updating results…")).toBeInTheDocument();
});
