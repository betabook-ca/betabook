import { ActionError } from "@/lib/action-result";
import { PROJECT_SHARE_AUDIENCES, type ProjectShareAudience } from "@/lib/privacy";
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
 * when someone else's link dies. The modifiers are a closed set for the same
 * reason the audiences are — nothing user-supplied reaches the statement. */
export const PROJECT_SHARE_EXPIRIES = [
  { value: "7d", label: "7 days", modifier: "+7 days" },
  { value: "30d", label: "30 days", modifier: "+30 days" },
  { value: "6mo", label: "6 months", modifier: "+6 months" },
  { value: "never", label: "Never", modifier: null },
] as const;

export type ProjectShareExpiry = (typeof PROJECT_SHARE_EXPIRIES)[number]["value"];

/** Long enough to be useful for a season's project, short enough that a link
 * pasted somewhere forgotten does not outlive the effort it describes. */
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

function audienceLabel(audience: ProjectShareAudience): string {
  return PROJECT_SHARE_AUDIENCES.find((option) => option.value === audience)?.label ?? "Friends";
}

/** One sentence for the card chip and the dialog, so the owner reads the same
 * description of a link wherever it is shown. `expiresAt` is the stored UTC
 * string; a link whose deadline has passed reads as expired rather than as
 * shared, because the row survives until something writes over it. */
export function describeProjectShare(
  audience: ProjectShareAudience,
  expiresAt: string | null,
  today: Date = new Date(),
): string {
  const who = audienceLabel(audience);
  if (!expiresAt) return `${who} · no expiry`;
  const deadline = new Date(`${expiresAt.replace(" ", "T")}Z`);
  if (Number.isNaN(deadline.getTime())) return who;
  const days = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return `${who} · expired`;
  return days === 1 ? `${who} · expires tomorrow` : `${who} · expires in ${days} days`;
}

/** Whether a stored deadline has passed. The database is the authority while
 * a link is being read — this only decides how the owner's own card reads. */
export function isProjectShareExpired(expiresAt: string | null, today: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const deadline = new Date(`${expiresAt.replace(" ", "T")}Z`);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() <= today.getTime();
}
