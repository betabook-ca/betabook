"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { getProjectShareForOwner } from "@/db/queries";
import { pinnedProjects } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { PINNED_PROJECT_LIMIT, PIN_LIMIT_MESSAGE } from "@/lib/projects";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

import { afterCommit } from "./post-commit";
import { revalidateProjectShare, revalidateProjectSurfaces } from "./revalidation";

/** Marks a climb as one of the climber's projects, which is the only thing
 * that puts it on the Projects tabs. Idempotent: pinning twice is a no-op
 * rather than an error, because the climber's intent is already satisfied and
 * a second click from a stale list should not read as a failure. */
export async function pinProject(climbId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(climbId) || climbId < 1) throw new ActionError("Climb not found");
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

    const db = await getDb();
    const climb = await db.get<{ id: number }>(
      sql`SELECT id FROM climbs WHERE id = ${climbId} LIMIT 1`,
    );
    if (!climb) throw new ActionError("Climb not found");

    // The cap is enforced inside the statement, not by a prior COUNT, so two
    // concurrent pins cannot both observe room and both take it.
    const [pinned] = await db.all<{ climbId: number }>(sql`
      INSERT INTO pinned_projects (user_id, climb_id)
      SELECT ${user.id}, ${climbId}
      WHERE (SELECT COUNT(*) FROM pinned_projects WHERE user_id = ${user.id})
            < ${PINNED_PROJECT_LIMIT}
      ON CONFLICT DO NOTHING
      RETURNING climb_id AS climbId
    `);

    if (!pinned) {
      // No row means the conflict clause swallowed a duplicate or the cap
      // rejected the insert. Only the latter is a failure worth reporting.
      const existing = await db.get<{ climbId: number }>(sql`
        SELECT climb_id AS climbId FROM pinned_projects
        WHERE user_id = ${user.id} AND climb_id = ${climbId}
      `);
      if (!existing) throw new ActionError(PIN_LIMIT_MESSAGE);
    }

    afterCommit(() => {
      revalidateProjectSurfaces(user.id);
      refresh();
    });
  });
}

/** Removes the pin. Unpinning something never pinned is not an error: the
 * requested end state already holds. Sessions and sends are untouched — the
 * pin is a bookmark, not the history. */
export async function unpinProject(climbId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(climbId) || climbId < 1) throw new ActionError("Climb not found");
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");

    const db = await getDb();
    // A share link is keyed to the pin, so this delete cascades it away and
    // the shared page stops resolving. The token is the only handle on the
    // page it served and it goes with the row, so read it first — the same
    // ordering `setUserPrivate` needs before its trigger fires.
    const shared = await getProjectShareForOwner(db, user.id, climbId);

    await db
      .delete(pinnedProjects)
      .where(and(eq(pinnedProjects.userId, user.id), eq(pinnedProjects.climbId, climbId)));

    afterCommit(() => {
      if (shared) revalidateProjectShare(shared.token);
      revalidateProjectSurfaces(user.id);
      refresh();
    });
  });
}
