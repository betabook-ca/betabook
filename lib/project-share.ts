import { ActionError } from "@/lib/action-result";
import { formatDate } from "@/lib/format-date";
import { parseShareToken } from "@/lib/share-token";

/** The token is the whole URL: no user id, no climb id, nothing to enumerate
 * and nothing revealed until it resolves against a live row. */
export function projectSharePath(token: string): string {
  return `/projects/${token}`;
}

export function parseProjectShareToken(value: unknown): string | null {
  return parseShareToken(value);
}

/** How long a new link lives. The value carries the SQLite modifier rather
 * than a day count so the deadline is `datetime('now', …)` computed by the
 * database: a client clock that is wrong by a week would otherwise decide
 * when someone else's link dies. The modifiers are a closed set so nothing
 * user-supplied ever reaches the statement.
 *
 * This is the only control on a link besides deleting it. There is no
 * audience: a link is a link, and whoever holds it can open it. See the
 * schema comment in drizzle/schema/project-share-links.ts for why offering
 * Friends or Members here would be a trap rather than a feature. */
export const PROJECT_SHARE_EXPIRIES = [
  { value: "7d", label: "7 days", modifier: "+7 days" },
  { value: "30d", label: "30 days", modifier: "+30 days" },
  { value: "6mo", label: "6 months", modifier: "+6 months" },
  { value: "never", label: "Never", modifier: null },
] as const;

export type ProjectShareExpiry = (typeof PROJECT_SHARE_EXPIRIES)[number]["value"];

/** Long enough to be useful for a season's project, short enough that a link
 * pasted somewhere forgotten does not outlive the effort it describes. It is
 * also the safer default now that every link is readable by anyone holding
 * it: the expiry is the control that still limits a link that got away. */
export const DEFAULT_PROJECT_SHARE_EXPIRY: ProjectShareExpiry = "30d";

export function parseProjectShareExpiry(value: unknown): ProjectShareExpiry {
  const expiry = PROJECT_SHARE_EXPIRIES.find((option) => option.value === value);
  if (!expiry) throw new ActionError("Invalid link expiry");
  return expiry.value;
}

/** The SQLite modifier for an expiry, or null for a link that never expires.
 * Callers pass this straight into `datetime('now', …)`; it is a constant from
 * the table above, never the caller's string. */
export function projectShareExpiryModifier(expiry: ProjectShareExpiry): string | null {
  return PROJECT_SHARE_EXPIRIES.find((option) => option.value === expiry)?.modifier ?? null;
}

/** When a link runs out, for the card chip and the dialog. An absolute date
 * rather than a countdown: "in 30 days" reads the same whether the link dies
 * before or after a trip, and the owner is deciding about a calendar. It also
 * keeps the string free of the current time, so a server render and its
 * hydration cannot disagree about it.
 *
 * `expiresAt` is the stored UTC datetime; only its date is shown, because an
 * hour is more precision than the decision needs. */
export function describeProjectShare(expiresAt: string | null): string {
  if (!expiresAt) return "Link never expires";
  const date = expiresAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `Link expires ${formatDate(date)}` : "Link";
}

/** Whether a stored deadline has passed. The database is the authority while
 * a link is being read — this only decides how the owner's own card reads. */
export function isProjectShareExpired(expiresAt: string | null, today: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const deadline = new Date(`${expiresAt.replace(" ", "T")}Z`);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() <= today.getTime();
}
