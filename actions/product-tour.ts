"use server";

import { and, lte, or, lt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { userProductTours } from "@/db/schema";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { validateProductTourUpdate } from "@/lib/product-tour";
import { requireSession } from "@/lib/session";

import { afterCommit } from "./post-commit";

export async function saveProductTourStatus(
  id: string,
  version: number,
  status: string,
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireSession();
    const update = validateProductTourUpdate(id, version, status);
    const db = await getDb();
    await db
      .insert(userProductTours)
      .values({ userId: session.user.id, ...update })
      .onConflictDoUpdate({
        target: [userProductTours.userId, userProductTours.tourId],
        set: update,
        // A stale tab cannot downgrade a completed tour or a newer version.
        setWhere: and(
          lte(userProductTours.version, version),
          update.status === "dismissed"
            ? or(lt(userProductTours.version, version), ne(userProductTours.status, "completed"))
            : undefined,
        ),
      });
    afterCommit(() => {
      revalidatePath(`/users/${session.user.id}`);
      revalidatePath(`/users/${session.user.id}/journal`);
      revalidatePath("/account");
    });
  });
}
