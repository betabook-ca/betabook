import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import {
  acceptFriendRequest,
  cancelFriendRequest,
  removeFriendship,
  requestFriendship,
} from "@/actions";
import type { FriendshipStatus } from "@/lib/friendships";

import { FriendshipButton } from "./friendship-button";

vi.mock("@/actions", () => ({
  requestFriendship: vi.fn<() => Promise<unknown>>(),
  acceptFriendRequest: vi.fn<() => Promise<unknown>>(),
  cancelFriendRequest: vi.fn<() => Promise<unknown>>(),
  declineFriendRequest: vi.fn<() => Promise<unknown>>(),
  removeFriendship: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/components/friend-requests-provider", () => ({
  useFriendRequests: () => ({ userId: null, count: null, refresh: async () => {} }),
}));

beforeEach(() => {
  vi.mocked(requestFriendship).mockReset();
  vi.mocked(acceptFriendRequest).mockReset();
  vi.mocked(cancelFriendRequest).mockReset();
  vi.mocked(removeFriendship).mockReset();
});

function renderProfile(initialStatus: FriendshipStatus) {
  render(
    <FriendshipButton
      userId="alex"
      name="Alex Rivera"
      initialStatus={initialStatus}
      appearance="profile"
    />,
  );
}

it("adds a friend from one button beside a profile's name", async () => {
  vi.mocked(requestFriendship).mockResolvedValue({ ok: true, value: "outgoing" });
  const user = userEvent.setup();
  renderProfile("none");

  expect(screen.getAllByRole("button")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Add friend: Alex Rivera" }));

  expect(requestFriendship).toHaveBeenCalledExactlyOnceWith("alex");
  expect(
    await screen.findByRole("button", { name: "Friend request sent to Alex Rivera" }),
  ).toBeVisible();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("says why a friend request couldn't be sent", async () => {
  vi.mocked(requestFriendship).mockResolvedValue({ ok: false, error: "Try again later." });
  const user = userEvent.setup();
  renderProfile("none");

  await user.click(screen.getByRole("button", { name: "Add friend: Alex Rivera" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Try again later.");
});

it("cancels a sent request from its menu after confirming", async () => {
  vi.mocked(cancelFriendRequest).mockResolvedValue({ ok: true, value: "none" });
  const user = userEvent.setup();
  renderProfile("outgoing");

  await user.click(screen.getByRole("button", { name: "Friend request sent to Alex Rivera" }));
  await user.click(await screen.findByRole("menuitem", { name: "Cancel request" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(cancelFriendRequest).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Cancel request" }));

  expect(cancelFriendRequest).toHaveBeenCalledExactlyOnceWith("alex");
  expect(await screen.findByRole("button", { name: "Add friend: Alex Rivera" })).toBeVisible();
});

it("answers an incoming request from the menu beside the name", async () => {
  vi.mocked(acceptFriendRequest).mockResolvedValue({ ok: true, value: "friends" });
  const user = userEvent.setup();
  renderProfile("incoming");

  expect(screen.getAllByRole("button")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Alex Rivera sent you a friend request" }));
  expect(await screen.findByRole("menuitem", { name: "Decline request" })).toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Accept request" }));

  expect(acceptFriendRequest).toHaveBeenCalledExactlyOnceWith("alex");
  expect(
    await screen.findByRole("button", { name: "Friendship options for Alex Rivera" }),
  ).toBeVisible();
});

it("keeps Remove friend behind a friend's profile menu and confirms it", async () => {
  vi.mocked(removeFriendship).mockResolvedValue({ ok: true, value: "none" });
  const user = userEvent.setup();
  renderProfile("friends");

  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Remove friend/ })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Friendship options for Alex Rivera" }));
  await user.click(await screen.findByRole("menuitem", { name: "Remove friend" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(removeFriendship).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Remove friend" }));

  expect(removeFriendship).toHaveBeenCalledExactlyOnceWith("alex");
  expect(await screen.findByRole("button", { name: "Add friend: Alex Rivera" })).toBeVisible();
});

it("keeps the Remove friend button on friend list rows", () => {
  render(<FriendshipButton userId="alex" name="Alex Rivera" initialStatus="friends" />);

  expect(screen.getByRole("button", { name: "Remove friend: Alex Rivera" })).toBeVisible();
});
