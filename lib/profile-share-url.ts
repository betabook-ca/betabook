import type { Database } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { profileSharePath, withProfileShare } from "@/lib/profile-share";
import { tripHref } from "@/lib/trips";

type Owner = { id: string; isPrivate: boolean };

async function ownShareUrl(db: Database, owner: Owner, path: (token: string) => string) {
  if (owner.isPrivate) return null;
  const token = await getProfileShareToken(db, owner.id);
  return token ? new URL(path(token), await getBaseUrl()).href : null;
}

/** Only for the owner's own pages; null while the profile is private. */
export function getOwnProfileShareUrl(db: Database, owner: Owner) {
  return ownShareUrl(db, owner, (token) => profileSharePath(owner.id, token));
}

/** The same link, opened on one of the owner's trips. */
export function getOwnTripShareUrl(db: Database, owner: Owner, tripId: number) {
  return ownShareUrl(db, owner, (token) => withProfileShare(tripHref(owner.id, tripId), token));
}
