import type { Database } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { profileSharePath } from "@/lib/profile-share";

/** Only for the owner's own pages; null while the profile is private. */
export async function getOwnProfileShareToken(
  db: Database,
  owner: { id: string; isPrivate: boolean },
) {
  if (owner.isPrivate) return null;
  return getProfileShareToken(db, owner.id);
}

export async function getOwnProfileShareUrl(
  db: Database,
  owner: { id: string; isPrivate: boolean },
) {
  const token = await getOwnProfileShareToken(db, owner);
  return token ? new URL(profileSharePath(owner.id, token), await getBaseUrl()).href : null;
}
