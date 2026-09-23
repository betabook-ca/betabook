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
export const resetProfileShareLink = fn<typeof Actions.resetProfileShareLink>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const prepareRecapShare = fn<typeof Actions.prepareRecapShare>().mockResolvedValue({
  ok: true,
  value: { token: "ASNFZ4mrze8BI0VniavN7w", path: "/r/ASNFZ4mrze8BI0VniavN7w" },
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

export const saveGoal = fn<typeof Actions.saveGoal>().mockResolvedValue({ ok: true, value: -1 });
export const deleteGoal = fn<typeof Actions.deleteGoal>().mockResolvedValue({
  ok: true,
  value: undefined,
});

export const createJournalEntry = fn<typeof Actions.createJournalEntry>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const createUndatedSend = fn<typeof Actions.createUndatedSend>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const updateJournalEntry = fn<typeof Actions.updateJournalEntry>().mockResolvedValue({
  ok: true,
  value: undefined,
});

export const acknowledgeGoalAchievements = fn<
  typeof Actions.acknowledgeGoalAchievements
>().mockResolvedValue({ ok: true, value: undefined });

export const archiveGoal = fn<typeof Actions.archiveGoal>().mockResolvedValue({
  ok: true,
  value: undefined,
});

export const endRecurringGoal = fn<typeof Actions.endRecurringGoal>().mockResolvedValue({
  ok: true,
  value: undefined,
});

export const requestAreaEdit = fn<typeof Actions.requestAreaEdit>().mockResolvedValue({
  ok: true,
  value: { status: "pending" },
});
export const requestClimbEdit = fn<typeof Actions.requestClimbEdit>().mockResolvedValue({
  ok: true,
  value: { status: "pending" },
});
export const requestClimbBreak = fn<typeof Actions.requestClimbBreak>().mockResolvedValue({
  ok: true,
  value: { status: "pending" },
});
export const approveChangeRequest = fn<typeof Actions.approveChangeRequest>().mockResolvedValue({
  ok: true,
  value: { decision: "awaiting" },
});
export const rejectChangeRequest = fn<typeof Actions.rejectChangeRequest>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const pinProject = fn<typeof Actions.pinProject>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const unpinProject = fn<typeof Actions.unpinProject>().mockResolvedValue({
  ok: true,
  value: undefined,
});
export const shareProject = fn<typeof Actions.shareProject>().mockResolvedValue({
  ok: true,
  value: { token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36", expiresAt: "2099-01-01 00:00:00" },
});
export const unshareProject = fn<typeof Actions.unshareProject>().mockResolvedValue({
  ok: true,
  value: undefined,
});
