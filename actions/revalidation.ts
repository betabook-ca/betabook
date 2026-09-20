import { revalidatePath } from "next/cache";

/** Both Projects tabs. A pin moves between them rather than disappearing, so
 * anything that can create or remove a send has to invalidate the pair —
 * invalidating only Projects would leave the sent tab showing a stale
 * list, or missing a climb that just moved into it. */
export function revalidateProjectSurfaces(userId: string) {
  revalidatePath(`/users/${userId}/projects`);
  revalidatePath(`/users/${userId}/sent-projects`);
}

/** Every cached surface whose rendered aggregates or rows can change after a
 * send write. Keeping this set centralized prevents a new mutation path from
 * quietly omitting the feed, profile, climb, or area list. */
export function revalidateSendSurfaces({
  userIds,
  climbIds,
  areaIds,
}: {
  userIds: Iterable<string>;
  climbIds: Iterable<number>;
  areaIds: Iterable<number>;
}) {
  revalidatePath("/");
  revalidatePath("/feed");
  for (const userId of new Set(userIds)) {
    revalidatePath(`/users/${userId}`);
    revalidatePath(`/users/${userId}/sends`);
    revalidateProjectSurfaces(userId);
    revalidatePath(`/users/${userId}/goals`);
    revalidatePath(`/users/${userId}/analytics`);
  }
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
  for (const areaId of new Set(areaIds)) revalidatePath(`/areas/${areaId}`);
}

/** Every cached surface that renders a climber's name or avatar. Shared by
 * the account mutations that change either, so a new one (a photo upload,
 * say) cannot quietly leave a stale avatar in the feed. */
export function revalidateProfileSurfaces(userId: string) {
  revalidatePath("/feed");
  revalidatePath("/friends");
  revalidatePath(`/users/${userId}`);
  revalidatePath(`/users/${userId}/journal`);
  revalidatePath(`/users/${userId}/sends`);
  revalidateProjectSurfaces(userId);
  revalidatePath(`/users/${userId}/analytics`);
}

export function revalidateJournalSurfaces({
  userId,
  climbIds,
}: {
  userId: string;
  climbIds: Iterable<number>;
}) {
  revalidatePath("/feed");
  revalidatePath(`/users/${userId}`);
  revalidatePath(`/users/${userId}/journal`);
  revalidateProjectSurfaces(userId);
  revalidatePath(`/users/${userId}/goals`);
  revalidatePath(`/users/${userId}/analytics`);
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
}
