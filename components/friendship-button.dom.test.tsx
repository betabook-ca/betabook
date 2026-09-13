import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { removeFriendship } from "@/actions";

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
  vi.mocked(removeFriendship).mockReset();
});

it("keeps Remove friend behind a friend's profile menu and confirms it", async () => {
  vi.mocked(removeFriendship).mockResolvedValue({ ok: true, value: "none" });
  const user = userEvent.setup();
  render(
    <FriendshipButton
      userId="alex"
      name="Alex Rivera"
      initialStatus="friends"
      appearance="profile"
    />,
  );

  expect(screen.getByText("Friends")).toBeInTheDocument();
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
