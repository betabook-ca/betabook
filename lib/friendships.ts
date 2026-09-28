export type FriendshipStatus = "none" | "incoming" | "outgoing" | "friends";

/** One canonical row for the unordered pair, regardless of who requests first. */
export function friendshipPair(a: string, b: string) {
  return a < b ? { userId: a, friendId: b } : { userId: b, friendId: a };
}

/** The two lists /friends shows, from its `view` search param. */
export type FriendsView = "friends" | "requests";

export function parseFriendsView(value: unknown): FriendsView {
  return value === "requests" ? "requests" : "friends";
}
