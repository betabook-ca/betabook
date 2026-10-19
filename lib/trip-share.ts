/** What a trip link shows, said in the Share dialog before a link exists. The
 * shared page overrides the owner's journal and send-comment audiences for
 * this trip, so this sentence has to keep covering everything on it; anything
 * added to `SharedTrip` needs it changed first. */
export const TRIP_SHARE_SENTENCE =
  "Anyone with the link sees this trip: its notes, photos, journal entries, sends and analytics.";

/** The token is the whole URL, as for a project link: no user id, no trip id,
 * nothing to enumerate and nothing revealed until it resolves against a live
 * row. */
export function tripSharePath(token: string): string {
  return `/trips/${token}`;
}

export function tripShareAnalyticsPath(token: string): string {
  return `${tripSharePath(token)}/analytics`;
}
