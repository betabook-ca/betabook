import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { requestFriendship } from "@/actions";
import { climberSearchItems, type SearchFetcher } from "@/lib/search";

import { FriendsSearch } from "./friends-search";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>() }),
}));
vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    children,
    ...props
  }: import("react").ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{children}</a>,
}));
vi.mock("@/actions", () => ({
  requestFriendship: vi.fn<typeof requestFriendship>(),
  acceptFriendRequest: vi.fn<() => Promise<unknown>>(),
  declineFriendRequest: vi.fn<() => Promise<unknown>>(),
  cancelFriendRequest: vi.fn<() => Promise<unknown>>(),
  removeFriendship: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequests: () => ({ refresh: async () => {} }),
}));

it("finds climbers and sends a request without leaving the friends page", async () => {
  const fetcher = vi.fn<SearchFetcher>().mockResolvedValue({
    items: climberSearchItems([
      { id: "sam", name: "Sam Rivera", image: null, friendshipStatus: "none" },
    ]),
    hasMore: false,
    nextPage: 2,
  });
  vi.mocked(requestFriendship).mockResolvedValue({ ok: true, value: "outgoing" });
  render(<FriendsSearch fetcher={fetcher} />);
  const user = userEvent.setup();
  expect(fetcher).not.toHaveBeenCalled();
  await user.type(screen.getByRole("searchbox", { name: "Find climbers" }), "Sam");
  await user.click(await screen.findByRole("button", { name: "Add friend: Sam Rivera" }));
  expect(requestFriendship).toHaveBeenCalledExactlyOnceWith("sam");
  expect(await screen.findByRole("button", { name: "Cancel request: Sam Rivera" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledWith(
    expect.objectContaining({ category: "climber", query: "Sam" }),
    "climber",
    1,
    expect.any(AbortSignal),
  );
  await user.clear(screen.getByRole("searchbox", { name: "Find climbers" }));
  expect(screen.queryByText("Sam Rivera")).not.toBeInTheDocument();
});

it("preserves the query when search fails and retries it", async () => {
  const fetcher = vi
    .fn<SearchFetcher>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ items: [], hasMore: false, nextPage: 2 });
  render(<FriendsSearch fetcher={fetcher} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole("searchbox", { name: "Find climbers" }), "Sam");
  await user.click(await screen.findByRole("button", { name: "Retry climbers" }));
  await waitFor(() => expect(screen.getByText(/No matching climbers/)).toBeVisible());
  expect(screen.getByRole("searchbox", { name: "Find climbers" })).toHaveValue("Sam");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("replaces suggestions with search results and identifies existing friends", async () => {
  const fetcher = vi.fn<SearchFetcher>().mockResolvedValue({
    items: climberSearchItems([
      { id: "sam", name: "Sam Rivera", image: null, friendshipStatus: "friends" },
    ]),
    hasMore: false,
    nextPage: 2,
  });
  render(
    <FriendsSearch fetcher={fetcher}>
      <section aria-label="You may know">Suggested partners</section>
    </FriendsSearch>,
  );
  const user = userEvent.setup();
  expect(screen.getByRole("region", { name: "You may know" })).toBeVisible();
  await user.type(screen.getByRole("searchbox", { name: "Find climbers" }), "Sam");
  expect(screen.queryByRole("region", { name: "You may know" })).not.toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Your friends" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Add friend: Sam Rivera" })).not.toBeInTheDocument();
  await user.clear(screen.getByRole("searchbox", { name: "Find climbers" }));
  expect(screen.getByRole("region", { name: "You may know" })).toBeVisible();
});
