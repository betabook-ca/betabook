import { formatDate } from "@/lib/format-date";
import { ISO_DATE_RE } from "@/lib/sends";

/** Expiry options shown when creating a share link. */
export const SHARE_EXPIRIES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "6mo", label: "6 months" },
  { value: "never", label: "Never" },
] as const;

export type ShareExpiry = (typeof SHARE_EXPIRIES)[number]["value"];

/** Long enough to be useful for a season's project, short enough that a link
 * pasted somewhere forgotten does not outlive the thing it describes. Anyone
 * holding a link can read it, so the expiry is what limits one that got away. */
export const DEFAULT_SHARE_EXPIRY: ShareExpiry = "30d";

/** When a link runs out, for a card chip and the dialog. An absolute date
 * rather than a countdown: "in 30 days" reads the same whether the link dies
 * before or after a trip, and the owner is deciding about a calendar. It also
 * keeps the string free of the current time, so a server render and its
 * hydration cannot disagree about it.
 *
 * `expiresAt` is the stored UTC datetime; only its date is shown, because an
 * hour is more precision than the decision needs. */
export function describeShareExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "Link never expires";
  const date = expiresAt.slice(0, 10);
  return ISO_DATE_RE.test(date) ? `Link expires ${formatDate(date)}` : "Link";
}

/** Whether a stored deadline has passed, for the owner's own card. The
 * database is the authority while a link is being read; this only decides how
 * the card describes it.
 *
 * `today` is the caller's `YYYY-MM-DD`, not a `Date`, and there is no default.
 * Reading the clock here would put the current time inside a render that runs
 * on the server and again on the client, which is how a card ends up
 * disagreeing with its own hydration. Callers pass the date they already
 * resolve on the client after mount, and `null` before that — unknown clock,
 * so the link reads as live until the client says otherwise. */
export function isShareExpired(expiresAt: string | null, today: string | null): boolean {
  if (!expiresAt || !today) return false;
  return expiresAt.slice(0, 10) < today;
}
