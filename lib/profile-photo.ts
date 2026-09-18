import { getGoogleProfileImageUrl } from "@/lib/user-initials";

/** A climber who chose initials in Account settings. Photos are suppressed at
 * every read instead of by clearing `user.image`, so the stored URL survives
 * the opt-out and turning the setting back on restores the same photo.
 *
 * Raw SQL reads use `shownUserImageSql` (db/queries/shared.ts) so a row can
 * never carry a hidden photo out of the query. This is for the few places
 * holding a whole user row or a Better Auth session instead: the account
 * header, a visited profile and the navigation avatar. */
export function shownProfilePhoto(user: {
  image: string | null;
  showProfilePhoto: boolean;
}): string | null {
  return user.showProfilePhoto ? user.image : null;
}

/** Whether this account has a photo the app would actually render, which is
 * what decides if the Show photo setting is worth offering: an email/password
 * account, or a stored value next/image won't optimize, only ever shows
 * initials, so the control would do nothing. */
export function hasProfilePhoto(image: string | null | undefined): boolean {
  return getGoogleProfileImageUrl(image) !== null;
}
