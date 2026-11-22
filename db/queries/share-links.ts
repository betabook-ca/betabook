import { sql, type SQL } from "drizzle-orm";

/** A share link's deadline has not passed: null `expires_at` is indefinite.
 * The owner's Share dialogs read a link through this alone, so the button
 * says Shared exactly while the page would open. */
export function shareLinkLiveSql(expiresAt: SQL = sql`link.expires_at`): SQL {
  // NULL > datetime('now') is NULL, not true, so the null branch is explicit.
  return sql`(${expiresAt} IS NULL OR ${expiresAt} > datetime('now'))`;
}

/** What makes a project, trip or list link readable, over an aliased `link`
 * row and its owner `share_owner`: not expired, and the owner not private.
 * There is no viewer in it: holding the URL is the whole of the permission.
 * Each share module explains what else can revoke its own links. */
export const shareLinkReadableSql = sql`
  share_owner.is_private = 0
  AND ${shareLinkLiveSql()}
`;
