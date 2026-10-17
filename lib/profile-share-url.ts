import type { Database } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import type { SharingAudience } from "@/lib/privacy";
import { profileSharePath, withProfileShare } from "@/lib/profile-share";
import { tripHref } from "@/lib/trips";

type Owner = { id: string; isPrivate: boolean };

async function ownShareUrl(db: Database, owner: Owner, path: (token: string) => string) {
  if (owner.isPrivate) return null;
  const token = await getProfileShareToken(db, owner.id);
  return token ? new URL(path(token), await getBaseUrl()).href : null;
}

/** Share URL for the owner's profile, or null if the profile is private. Only
 * call this for the signed-in owner. */
export function getOwnProfileShareUrl(db: Database, owner: Owner) {
  return ownShareUrl(db, owner, (token) => profileSharePath(owner.id, token));
}

/** Why the owner's trip link is off, if it is: the link only opens trips
 * shared with Members. */
export function tripShareOff(owner: Owner & { tripVisibility: SharingAudience }) {
  if (owner.isPrivate) return "private";
  return owner.tripVisibility === "public" ? null : "trips";
}

/** Share URL that opens one of the owner's trips, or null while `tripShareOff`
 * has a reason. Uses the same token as the profile link. */
export async function getOwnTripShareUrl(
  db: Database,
  owner: Owner & { tripVisibility: SharingAudience },
  tripId: number,
) {
  if (tripShareOff(owner)) return null;
  return ownShareUrl(db, owner, (token) => withProfileShare(tripHref(owner.id, tripId), token));
}
