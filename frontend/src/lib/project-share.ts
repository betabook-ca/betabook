/** The token is the whole URL: no user id, no climb id, nothing to enumerate
 * and nothing revealed until it resolves against a live row. */
export function projectSharePath(token: string): string {
  return `/projects/${token}`;
}
