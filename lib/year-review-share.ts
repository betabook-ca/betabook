/** What a year-in-review link shows, said in the Share dialog before a link
 * exists. The link shows the recap as the owner sees it, so this sentence
 * has to keep covering everything on it. Tagged partners are the one thing
 * that doesn't travel: they never saw this dialog. */
export const YEAR_REVIEW_SHARE_SENTENCE =
  "Anyone with the link sees this year in review: your stats, climbs, trips, send comments and personas. Tagged partners aren't shown.";

/** The token is the whole URL: no user id and no year to enumerate. */
export function yearReviewSharePath(token: string): string {
  return `/year/${token}`;
}

export function yearReviewPath(userId: string, year: number): string {
  return `/users/${userId}/year/${year}`;
}
