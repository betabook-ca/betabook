"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb } from "@/db/client";
import { getClimb, getJournalEntry } from "@/db/queries";
import { journalEntries, sends } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { assertLoggableOnClimb } from "@/lib/broken-climbs";
import { validateJournalInput } from "@/lib/journal";
import { readCompanionSelection } from "@/lib/journal-companions";
import { requirePositiveId } from "@/lib/validation";

import {
  buildCompanionInsert,
  buildCompanionReplacement,
  saveJournalBatch,
} from "./journal-companion-statements";
import {
  carriesSendFields,
  entryValues,
  planClimbEntry,
  readJournalFormData,
  requireClimb,
  requireJournalSession,
  SEND_CHANGED_MESSAGE,
  SESSION_SEND_FIELDS_MESSAGE,
  type ClimbEntryPlan,
} from "./journal-entry-plan";
import { buildJournalEntryGuard, rethrowJournalSendInvariant } from "./journal-sync";
import { afterCommit } from "./post-commit";
import { revalidateJournalSurfaces, revalidateSendSurfaces } from "./revalidation";

const ENTRY_NOT_FOUND = "Entry not found";
const ENTRY_CHANGED_MESSAGE = "The entry changed — refresh and try again";

export async function createJournalEntry(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    const userId = session.user.id;
    const db = await getDb();

    const input = validateJournalInput(readJournalFormData(formData));
    if (!input.sent && carriesSendFields(formData)) {
      throw new ActionError(SESSION_SEND_FIELDS_MESSAGE);
    }
    const companions = readCompanionSelection(formData);
    const climb = input.climbId === null ? null : await requireClimb(db, input.climbId);

    const plan: ClimbEntryPlan = climb
      ? await planClimbEntry(db, userId, input, climb, formData, companions)
      : {
          statements: [
            db.insert(journalEntries).values(entryValues(userId, input)),
            ...(companions?.length ? [buildCompanionInsert(db, userId, companions)] : []),
          ],
          writesSend: false,
        };

    try {
      await saveJournalBatch(db, plan.statements);
    } catch (error) {
      rethrowJournalSendInvariant(error, SEND_CHANGED_MESSAGE);
    }
    await scheduleGoalRefresh(db, userId);
    afterCommit(() => {
      revalidateJournalSurfaces({ userId, climbIds: climb ? [climb.id] : [] });
      if (climb && plan.writesSend) {
        revalidateSendSurfaces({
          userIds: [userId],
          climbIds: [climb.id],
          areaIds: [climb.areaId],
        });
      }
      refresh();
    });
  });
}

export async function updateJournalEntry(
  entryId: number,
  formData: FormData,
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    requirePositiveId(entryId, ENTRY_NOT_FOUND);
    const db = await getDb();

    const existing = await getJournalEntry(db, entryId, session.user.id);
    if (!existing) throw new ActionError(ENTRY_NOT_FOUND);

    const input = validateJournalInput(readJournalFormData(formData));
    if (!input.sent && carriesSendFields(formData)) {
      throw new ActionError(SESSION_SEND_FIELDS_MESSAGE);
    }
    const companions = readCompanionSelection(formData);

    if (input.sent !== existing.sent) {
      throw new ActionError(
        input.sent
          ? "Log the ascent from the climb page — an existing entry can't be turned into a send"
          : "Delete the entry instead — an ascent can't be un-sent by editing it",
      );
    }
    if (input.climbId !== existing.climbId) {
      throw new ActionError("Delete this entry and log a new one against the other climb");
    }
    if (existing.sent && input.entryDate !== existing.entryDate) {
      throw new ActionError("A sent session's date can't be changed after it is logged");
    }
    if (existing.climbId !== null && input.entryDate !== existing.entryDate) {
      assertLoggableOnClimb(await requireClimb(db, existing.climbId), input.entryDate);
    }

    const journalStatement = db
      .update(journalEntries)
      .set({
        kind: input.kind,
        entryDate: input.entryDate,
        body: input.body,
        tags: input.tags,
      })
      .where(eq(journalEntries.id, entryId))
      .returning({ id: journalEntries.id });

    const companionStatements = buildCompanionReplacement(db, session.user.id, entryId, companions);

    try {
      const [, updated] = await saveJournalBatch(db, [
        buildJournalEntryGuard(db, existing),
        journalStatement,
        ...companionStatements,
        ...(existing.isAscent && existing.climbId !== null
          ? [
              db
                .update(sends)
                .set({ comment: input.body })
                .where(
                  and(
                    eq(sends.userId, session.user.id),
                    eq(sends.climbId, existing.climbId),
                    sql`EXISTS (SELECT 1 FROM journal_entries j
                      WHERE j.id = ${entryId} AND j.user_id = ${session.user.id}
                        AND j.climb_id = ${existing.climbId} AND j.is_ascent = 1)`,
                  ),
                ),
            ]
          : []),
      ]);
      if (!updated.length) throw new ActionError(ENTRY_CHANGED_MESSAGE);
    } catch (error) {
      rethrowJournalSendInvariant(error, ENTRY_CHANGED_MESSAGE);
    }

    if (existing.isAscent && existing.climbId !== null) {
      const climbId = existing.climbId;
      const climb = await getClimb(db, climbId);
      afterCommit(() => {
        revalidateSendSurfaces({
          userIds: [session.user.id],
          climbIds: [climbId],
          areaIds: climb ? [climb.areaId] : [],
        });
      });
    }

    await scheduleGoalRefresh(db, session.user.id);
    afterCommit(() => {
      revalidateJournalSurfaces({
        userId: session.user.id,
        climbIds: existing.climbId === null ? [] : [existing.climbId],
      });
      refresh();
    });
  });
}

export async function deleteJournalEntry(entryId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    requirePositiveId(entryId, ENTRY_NOT_FOUND);
    const db = await getDb();

    const existing = await getJournalEntry(db, entryId, session.user.id);
    if (!existing) throw new ActionError(ENTRY_NOT_FOUND);

    const climbId = existing.climbId;
    try {
      await saveJournalBatch(db, [
        buildJournalEntryGuard(db, existing),
        ...(existing.isAscent && climbId !== null
          ? [
              // If the entry was deleted, leave any replacement send alone.
              db.delete(sends).where(
                and(
                  eq(sends.userId, session.user.id),
                  eq(sends.climbId, climbId),
                  sql`(SELECT j.id FROM journal_entries j
                    WHERE j.user_id = ${session.user.id} AND j.climb_id = ${climbId} AND j.is_ascent = 1
                    LIMIT 1) = ${entryId}`,
                ),
              ),
            ]
          : []),
        db.delete(journalEntries).where(eq(journalEntries.id, entryId)),
      ]);
    } catch (error) {
      rethrowJournalSendInvariant(error, ENTRY_CHANGED_MESSAGE);
    }

    if (existing.isAscent && climbId !== null) {
      const climb = await getClimb(db, climbId);
      afterCommit(() => {
        revalidateSendSurfaces({
          userIds: [session.user.id],
          climbIds: [climbId],
          areaIds: climb ? [climb.areaId] : [],
        });
      });
    }

    await scheduleGoalRefresh(db, session.user.id);
    afterCommit(() => {
      revalidateJournalSurfaces({
        userId: session.user.id,
        climbIds: climbId === null ? [] : [climbId],
      });
      refresh();
    });
  });
}
