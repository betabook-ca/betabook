import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { FriendList } from "./friend-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn<(href: string) => void>() }),
}));
vi.mock("@/actions", () => ({
  requestFriendship: vi.fn<() => Promise<unknown>>(),
  acceptFriendRequest: vi.fn<() => Promise<unknown>>(),
  declineFriendRequest: vi.fn<() => Promise<unknown>>(),
  cancelFriendRequest: vi.fn<() => Promise<unknown>>(),
  removeFriendship: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequests: () => ({ refresh: async () => {} }),
}));

it("shows the loaded friend count and appends the next batch only on request", async () => {
  const friend = (id: string) => ({
    id,
    name: `Partner ${id}`,
    image: null,
    isPrivate: true,
    friendshipStatus: "friends" as const,
  });
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ friends: [friend("11")], hasMore: false })));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <FriendList
      initialPage={{
        friends: Array.from({ length: 10 }, (_, i) => friend(String(i + 1))),
        hasMore: true,
      }}
      requestsOnly={false}
    />,
  );
  expect(screen.getByRole("status", { name: "Friend count" })).toHaveTextContent(
    "Showing 10 friends",
  );
  expect(fetchMock).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Partner 11")).toBeVisible();
  expect(screen.getByRole("status", { name: "Friend count" })).toHaveTextContent(
    "All 11 friends shown",
  );
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("heads the list for heading navigation and lists the climbers as items", () => {
  const page = {
    friends: [
      {
        id: "sam",
        name: "Sam Rivera",
        image: null,
        isPrivate: true,
        friendshipStatus: "friends" as const,
      },
      {
        id: "ana",
        name: "Ana Lopez",
        image: null,
        isPrivate: true,
        friendshipStatus: "incoming" as const,
      },
    ],
    hasMore: false,
  };
  const { rerender } = render(<FriendList initialPage={page} requestsOnly={false} />);
  expect(screen.getByRole("heading", { level: 2, name: "Friends" })).toBeInTheDocument();
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  rerender(<FriendList initialPage={page} requestsOnly />);
  expect(screen.getByRole("heading", { level: 2, name: "Friend requests" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 2, name: "Friends" })).not.toBeInTheDocument();
});

it("keeps removal in the friend menu and asks for confirmation", async () => {
  render(
    <FriendList
      initialPage={{
        friends: [
          {
            id: "sam",
            name: "Sam Rivera",
            image: null,
            isPrivate: true,
            friendshipStatus: "friends",
          },
        ],
        hasMore: false,
      }}
      requestsOnly={false}
    />,
  );
  const user = userEvent.setup();
  expect(
    screen.queryByRole("button", { name: "Remove friend: Sam Rivera" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Friendship options for Sam Rivera" }));
  await user.click(screen.getByRole("menuitem", { name: "Remove friend" }));
  expect(screen.getByRole("alertdialog")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Keep friend" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
