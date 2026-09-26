import { fn } from "storybook/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- Bypass the Storybook-only alias to type the real action boundary.
import type * as Actions from "../../actions";
// oxlint-disable-next-line import/no-relative-parent-imports -- Preserve unrelated actions; only these mutations are mocked.
export * from "../../actions";

// Each default is the implementation given to fn(), not a mockResolvedValue:
// Storybook restores every spy before each story, which drops the latter and
// keeps the former. A story scripts another outcome with
// mocked(action).mockResolvedValue(...) in beforeEach.

export const createArea = fn<typeof Actions.createArea>(async () => ({ ok: true, value: -1 }));
export const updateArea = fn<typeof Actions.updateArea>(async () => ({
  ok: true,
  value: undefined,
}));
export const createClimb = fn<typeof Actions.createClimb>(async () => ({ ok: true, value: -1 }));
export const updateClimb = fn<typeof Actions.updateClimb>(async () => ({
  ok: true,
  value: undefined,
}));
export const resetProfileShareLink = fn<typeof Actions.resetProfileShareLink>(async () => ({
  ok: true,
  value: undefined,
}));
export const uploadProfilePhoto = fn<typeof Actions.uploadProfilePhoto>(async () => ({
  ok: true,
  value: undefined,
}));
export const removeProfilePhoto = fn<typeof Actions.removeProfilePhoto>(async () => ({
  ok: true,
  value: undefined,
}));
export const requestFriendship = fn<typeof Actions.requestFriendship>(async () => ({
  ok: true,
  value: "outgoing",
}));
export const cancelFriendRequest = fn<typeof Actions.cancelFriendRequest>(async () => ({
  ok: true,
  value: "none",
}));
export const acceptFriendRequest = fn<typeof Actions.acceptFriendRequest>(async () => ({
  ok: true,
  value: "friends",
}));
export const declineFriendRequest = fn<typeof Actions.declineFriendRequest>(async () => ({
  ok: true,
  value: "none",
}));
export const removeFriendship = fn<typeof Actions.removeFriendship>(async () => ({
  ok: true,
  value: "none",
}));

export const saveGoal = fn<typeof Actions.saveGoal>(async () => ({ ok: true, value: -1 }));
export const deleteGoal = fn<typeof Actions.deleteGoal>(async () => ({
  ok: true,
  value: undefined,
}));

export const createJournalEntry = fn<typeof Actions.createJournalEntry>(async () => ({
  ok: true,
  value: undefined,
}));
export const createUndatedSend = fn<typeof Actions.createUndatedSend>(async () => ({
  ok: true,
  value: undefined,
}));
export const updateJournalEntry = fn<typeof Actions.updateJournalEntry>(async () => ({
  ok: true,
  value: undefined,
}));

export const acknowledgeGoalAchievements = fn<typeof Actions.acknowledgeGoalAchievements>(
  async () => ({ ok: true, value: undefined }),
);

export const archiveGoal = fn<typeof Actions.archiveGoal>(async () => ({
  ok: true,
  value: undefined,
}));

export const endRecurringGoal = fn<typeof Actions.endRecurringGoal>(async () => ({
  ok: true,
  value: undefined,
}));

export const requestAreaEdit = fn<typeof Actions.requestAreaEdit>(async () => ({
  ok: true,
  value: { status: "pending" },
}));
export const requestClimbEdit = fn<typeof Actions.requestClimbEdit>(async () => ({
  ok: true,
  value: { status: "pending" },
}));
export const requestClimbBreak = fn<typeof Actions.requestClimbBreak>(async () => ({
  ok: true,
  value: { status: "pending" },
}));
export const approveChangeRequest = fn<typeof Actions.approveChangeRequest>(async () => ({
  ok: true,
  value: { decision: "awaiting" },
}));
export const rejectChangeRequest = fn<typeof Actions.rejectChangeRequest>(async () => ({
  ok: true,
  value: undefined,
}));
export const pinProject = fn<typeof Actions.pinProject>(async () => ({
  ok: true,
  value: undefined,
}));
export const unpinProject = fn<typeof Actions.unpinProject>(async () => ({
  ok: true,
  value: undefined,
}));
export const shareProject = fn<typeof Actions.shareProject>(async () => ({
  ok: true,
  value: { token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36", expiresAt: "2099-01-01 00:00:00" },
}));
export const unshareProject = fn<typeof Actions.unshareProject>(async () => ({
  ok: true,
  value: undefined,
}));

export const saveTrip = fn<typeof Actions.saveTrip>(async () => ({ ok: true, value: -1 }));
export const deleteTrip = fn<typeof Actions.deleteTrip>(async () => ({
  ok: true,
  value: undefined,
}));
export const shareTrip = fn<typeof Actions.shareTrip>(async () => ({
  ok: true,
  value: { token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36", expiresAt: "2099-01-01 00:00:00" },
}));
export const unshareTrip = fn<typeof Actions.unshareTrip>(async () => ({
  ok: true,
  value: undefined,
}));
