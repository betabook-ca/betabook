export type FriendshipStatus = "none" | "incoming" | "outgoing" | "friends";

/** The two lists /friends shows, from its `view` search param. */
export type FriendsView = "friends" | "requests";

export function parseFriendsView(value: unknown): FriendsView {
  return value === "requests" ? "requests" : "friends";
}
