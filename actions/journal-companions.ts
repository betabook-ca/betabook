"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb } from "@/db/client";
import { journalVisibleSql } from "@/db/queries/content-access";
import { journalCompanions } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { allowJournalWrite } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";

import { revalidateJournalSurfaces } from "./revalidation";

export async function removeMyJournalTag(entryId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const { user } = await requireSession();
    if (!Number.isSafeInteger(entryId) || entryId < 1) throw new ActionError("Entry not found");
    if (!(await allowJournalWrite(user.id)))
      throw new ActionError("Too many changes — try again in a minute");
    const db = await getDb();
    const [removed] = await db
      .update(journalCompanions)
      .set({ suppressed: true })
      .where(
        and(
          eq(journalCompanions.entryId, entryId),
          eq(journalCompanions.userId, user.id),
          sql`EXISTS (SELECT 1 FROM journal_entries j WHERE j.id = ${entryId} AND ${journalVisibleSql(user.id, sql`j.user_id`)})`,
        ),
      )
      .returning({ entryId: journalCompanions.entryId });
    if (!removed) throw new ActionError("This tag is no longer available");
    const entry = await db.get<{ userId: string; climbId: number | null }>(
      sql`SELECT user_id AS userId, climb_id AS climbId FROM journal_entries WHERE id = ${entryId}`,
    );
    if (entry)
      revalidateJournalSurfaces({
        userId: entry.userId,
        climbIds: entry.climbId === null ? [] : [entry.climbId],
      });
    refresh();
  });
}
