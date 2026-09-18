"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import {
  PROFILE_PHOTO_MISSING_MESSAGE,
  PROFILE_PHOTO_TOO_MANY_MESSAGE,
  profilePhotoKeyFromImage,
  profilePhotoPath,
  profilePhotoProblem,
} from "@/lib/profile-photo";
import {
  deleteProfilePhoto,
  getProfilePhotoStore,
  PROFILE_PHOTO_UNAVAILABLE_MESSAGE,
  storeProfilePhoto,
} from "@/lib/profile-photo-store";
import { allowProfilePhotoWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

import { afterCommit } from "./post-commit";
import { revalidateProfileSurfaces } from "./revalidation";

/** Replaces the climber's photo with the square the picker produced.
 *
 * `user.image` is the single pointer to whatever photo is showing, so an
 * upload takes the same column a Google URL would (see lib/profile-photo.ts)
 * and the photo it replaces is deleted: one object per climber, always.
 *
 * Ordering is deliberate. The object is written first and the row second,
 * because a row pointing at bytes that do not exist would show a broken
 * avatar to everyone, while a written object no row names is 20 KB nobody
 * sees — and it is deleted if the row write then fails. */
export async function uploadProfilePhoto(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();

    const file = formData.get("photo");
    if (!(file instanceof File)) throw new ActionError(PROFILE_PHOTO_MISSING_MESSAGE);
    const problem = profilePhotoProblem(file);
    if (problem) throw new ActionError(problem);

    const store = await getProfilePhotoStore();
    if (!store) throw new ActionError(PROFILE_PHOTO_UNAVAILABLE_MESSAGE);

    // Checked before the transform, which is the part that costs something.
    if (!(await allowProfilePhotoWrite(session.user.id)))
      throw new ActionError(PROFILE_PHOTO_TOO_MANY_MESSAGE);

    const db = await getDb();
    const [current] = await db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    const key = await storeProfilePhoto(store, session.user.id, file);
    try {
      await db
        .update(user)
        .set({ image: profilePhotoPath(key) })
        .where(eq(user.id, session.user.id));
    } catch (error) {
      await deleteProfilePhoto(store.bucket, key);
      throw error;
    }

    // Re-uploading the identical crop yields the same key, so compare before
    // deleting: otherwise the replacement would delete what it just wrote.
    const replaced = profilePhotoKeyFromImage(current?.image);
    if (replaced && replaced !== key) await deleteProfilePhoto(store.bucket, replaced);

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}
