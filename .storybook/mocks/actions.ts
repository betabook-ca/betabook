import { fn } from "storybook/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- Bypass the Storybook-only alias to type the real action boundary.
import type * as Actions from "../../actions";
// oxlint-disable-next-line import/no-relative-parent-imports -- Preserve unrelated actions; only these mutations are mocked.
export * from "../../actions";

export const createArea = fn<typeof Actions.createArea>().mockResolvedValue({
  ok: true,
  value: -1,
});
export const updateArea = fn<typeof Actions.updateArea>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const createClimb = fn<typeof Actions.createClimb>().mockResolvedValue({
  ok: true,
  value: -1,
});
export const updateClimb = fn<typeof Actions.updateClimb>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const requestFriendship = fn<typeof Actions.requestFriendship>().mockResolvedValue({
  ok: true,
  value: "outgoing",
});
export const cancelFriendRequest = fn<typeof Actions.cancelFriendRequest>().mockResolvedValue({
  ok: true,
  value: "none",
});
export const acceptFriendRequest = fn<typeof Actions.acceptFriendRequest>().mockResolvedValue({
  ok: true,
  value: "friends",
});
export const declineFriendRequest = fn<typeof Actions.declineFriendRequest>().mockResolvedValue({
  ok: true,
  value: "none",
});
export const removeFriendship = fn<typeof Actions.removeFriendship>().mockResolvedValue({
  ok: true,
  value: "none",
});
