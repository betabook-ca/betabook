/** The token is the whole URL: no user id, no trip id, nothing to enumerate
 * and nothing revealed until it resolves against a live row. */
export function tripSharePath(token: string): string {
  return `/trips/${token}`;
}
