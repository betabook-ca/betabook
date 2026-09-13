import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { SuggestedClimberRow } from "@/db/queries";

import { FriendSuggestions } from "./friend-suggestions";

vi.mock("@/actions", () => ({
  requestFriendship: vi.fn<() => Promise<{ ok: true; value: "outgoing" }>>(async () => ({
    ok: true,
    value: "outgoing",
  })),
  acceptFriendRequest: vi.fn<() => Promise<never>>(),
  cancelFriendRequest: vi.fn<() => Promise<never>>(),
  declineFriendRequest: vi.fn<() => Promise<never>>(),
  removeFriendship: vi.fn<() => Promise<never>>(),
}));
const climber = (id: string, name: string, mutualFriendCount: number): SuggestedClimberRow => ({
  id,
  name,
  image: null,
  friendshipStatus: "none",
  mutualFriendCount,
});

it("keeps shown suggestions and their request state when the page refreshes with a new list", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <FriendSuggestions
      climbers={[climber("sam", "Sam Rivera", 2), climber("jordan", "Jordan Park", 1)]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Add friend: Sam Rivera" }));
  expect(
    await screen.findByRole("button", { name: "Cancel request: Sam Rivera" }),
  ).toBeInTheDocument();
  // requestFriendship revalidates /friends, and the server list no longer includes Sam.
  rerender(
    <FriendSuggestions
      climbers={[climber("jordan", "Jordan Park", 1), climber("kai", "Kai Nakamura", 1)]}
    />,
  );
  expect(screen.getByRole("button", { name: "Cancel request: Sam Rivera" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Friend request sent");
  expect(screen.getByRole("button", { name: "Add friend: Jordan Park" })).toBeEnabled();
  expect(screen.queryByText("Kai Nakamura")).not.toBeInTheDocument();
});
