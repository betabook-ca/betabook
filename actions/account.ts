"use server";

import { eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { getUserIdByName } from "@/db/queries";
import { profileShareLinks, user } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { DISPLAY_NAME_TAKEN_MESSAGE, displayNameProblem } from "@/lib/display-name";
import { parseSendCommentAudience, parseSharingAudience } from "@/lib/privacy";
import { requireSession } from "@/lib/session";
import { requireTrimmed } from "@/lib/validation";

import { afterCommit } from "./post-commit";

function revalidateProfileSurfaces(userId: string) {
  revalidatePath("/feed");
  revalidatePath("/friends");
  revalidatePath(`/users/${userId}`);
  revalidatePath(`/users/${userId}/journal`);
  revalidatePath(`/users/${userId}/sends`);
  revalidatePath(`/users/${userId}/projects`);
  revalidatePath(`/users/${userId}/analytics`);
}

export async function setUserPrivate(isPrivate: boolean): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    await db.update(user).set({ isPrivate }).where(eq(user.id, session.user.id));

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}

/** The OAuth photo is kept in `user.image` either way, so turning this back
 * on restores the same photo — see drizzle/schema/auth.ts. Reads suppress it
 * instead (shownUserImageSql, lib/profile-photo.ts), which is why this
 * revalidates the same surfaces a rename does. */
export async function setShowProfilePhoto(showProfilePhoto: boolean): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    await db.update(user).set({ showProfilePhoto }).where(eq(user.id, session.user.id));

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}

/** Stops links and QR codes already handed out from naming the owner. */
export async function resetProfileShareLink(): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();
    const token = sql`lower(hex(randomblob(16)))`;

    await db
      .insert(profileShareLinks)
      .values({ userId: session.user.id, token })
      .onConflictDoUpdate({ target: profileShareLinks.userId, set: { token } });

    afterCommit(() => {
      revalidatePath(`/users/${session.user.id}`);
      refresh();
    });
  });
}

export async function updateDisplayName(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();

    const name = requireTrimmed(formData.get("name"), "Display name");
    const problem = displayNameProblem(name);
    if (problem) throw new ActionError(problem);

    // Friendly pre-check; a same-instant race falls through to
    // user_name_unique_idx and comes back as the generic error instead.
    const holder = await getUserIdByName(db, name);
    if (holder && holder !== session.user.id) throw new ActionError(DISPLAY_NAME_TAKEN_MESSAGE);

    await db.update(user).set({ name }).where(eq(user.id, session.user.id));

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}

export async function setJournalVisibility(visibility: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();
    const journalVisibility = parseSharingAudience(visibility);

    await db.update(user).set({ journalVisibility }).where(eq(user.id, session.user.id));

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}

export async function setSendCommentVisibility(visibility: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const db = await getDb();
    const sendCommentVisibility = parseSendCommentAudience(visibility);

    await db.update(user).set({ sendCommentVisibility }).where(eq(user.id, session.user.id));

    afterCommit(() => {
      revalidateProfileSurfaces(session.user.id);
      refresh();
    });
  });
}
