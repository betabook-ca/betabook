import {
  DEFAULT_SHARE_EXPIRY,
  SHARE_EXPIRIES,
  describeShareExpiry,
  isShareExpired,
  parseShareExpiry,
  shareExpiryModifier,
  type ShareExpiry,
} from "@/lib/share-expiry";
import { parseShareToken } from "@/lib/share-token";

/** The token is the whole URL: no user id, no climb id, nothing to enumerate
 * and nothing revealed until it resolves against a live row. */
export function projectSharePath(token: string): string {
  return `/projects/${token}`;
}

export function parseProjectShareToken(value: unknown): string | null {
  return parseShareToken(value);
}

/** The expiry options and their helpers are shared with every other link
 * feature — see `lib/share-expiry.ts`, which holds the reasoning for the
 * closed set of SQLite modifiers and for there being no audience control.
 * Re-exported under the project names their call sites already use. */
export const PROJECT_SHARE_EXPIRIES = SHARE_EXPIRIES;
export type ProjectShareExpiry = ShareExpiry;
export const DEFAULT_PROJECT_SHARE_EXPIRY = DEFAULT_SHARE_EXPIRY;

export function parseProjectShareExpiry(value: unknown): ProjectShareExpiry {
  return parseShareExpiry(value);
}

export function projectShareExpiryModifier(expiry: ProjectShareExpiry): string | null {
  return shareExpiryModifier(expiry);
}

export function describeProjectShare(expiresAt: string | null): string {
  return describeShareExpiry(expiresAt);
}

export function isProjectShareExpired(expiresAt: string | null, today: string | null): boolean {
  return isShareExpired(expiresAt, today);
}
