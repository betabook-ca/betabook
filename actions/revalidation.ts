import { revalidatePath } from "next/cache";

/** Both Projects tabs. A pin moves between them rather than disappearing, so
 * anything that can create or remove a send has to invalidate the pair —
 * invalidating only Projects would leave the sent tab showing a stale
 * list, or missing a climb that just moved into it. */
export function revalidateProjectSurfaces(userId: string) {
  revalidatePath(`/users/${userId}/projects`);
  revalidatePath(`/users/${userId}/projects/sent`);
}

/** The trips list, whose per-trip counts are derived from journal and send
 * rows rather than stored. A trip owns nothing, so any write that adds or
 * removes a dated entry changes which trips contain it and what each one
 * counts — which is why this is nested into the journal and send helpers
 * below rather than called only by the trip mutations.
 *
 * The trip detail tabs are not listed: they are dynamic per trip id, and their
 * data is read per request rather than cached. */
export function revalidateTripSurfaces(userId: string) {
  revalidatePath(`/users/${userId}/trips`);
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
    revalidateTripSurfaces(userId);
    revalidatePath(`/users/${userId}/goals`);
    revalidatePath(`/users/${userId}/analytics`);
  }
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
  for (const areaId of new Set(areaIds)) revalidatePath(`/areas/${areaId}`);
}

/** Every cached surface that renders a climber's name or avatar, or depends
 * on their journal visibility. */
export function revalidateProfileSurfaces(userId: string) {
  revalidatePath("/feed");
  revalidatePath("/friends");
  revalidatePath(`/users/${userId}`);
  revalidatePath(`/users/${userId}/journal`);
  revalidatePath(`/users/${userId}/sends`);
  revalidateProjectSurfaces(userId);
  revalidateTripSurfaces(userId);
  revalidatePath(`/users/${userId}/goals`);
  revalidatePath(`/users/${userId}/analytics`);
}

/** Goals render only on the Goals page and, as completion events, in feeds. */
export function revalidateGoalSurfaces(userId: string) {
  revalidatePath("/feed");
  revalidatePath(`/users/${userId}/goals`);
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
  revalidateTripSurfaces(userId);
  revalidatePath(`/users/${userId}/goals`);
  revalidatePath(`/users/${userId}/analytics`);
  for (const climbId of new Set(climbIds)) revalidatePath(`/climbs/${climbId}`);
}
