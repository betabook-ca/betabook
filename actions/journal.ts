"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";

import { getDb, type Database } from "@/db/client";
import { getClimb, getJournalEntry, getUserSendForClimb } from "@/db/queries";
import { journalEntries, sends } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import type { ClimbType } from "@/lib/grades";
import { validateJournalInput, type JournalEntryInput } from "@/lib/journal";
import { readCompanionSelection } from "@/lib/journal-companions";
import { allowJournalWrite } from "@/lib/rate-limit";
import { validateSendInput, type RawSendInput } from "@/lib/sends";
import { requireSession } from "@/lib/session";
import { pickFormFields } from "@/lib/validation";

import {
  buildCompanionInsert,
  buildCompanionReplacement,
  saveJournalBatch,
} from "./journal-companion-statements";
import {
  assertRepeatDate,
  buildJournalEntryGuard,
  buildSentJournalInsert,
  getSentJournalEntries,
  journalEntryFromSend,
  rethrowJournalSendInvariant,
} from "./journal-sync";
import { revalidateJournalSurfaces, revalidateSendSurfaces } from "./revalidation";
import { buildMirroredSendUpdate, buildSendInsert } from "./send-statements";

const JOURNAL_FORM_FIELDS = ["kind", "climbId", "sent", "entryDate", "body"] as const;

const SEND_FORM_FIELDS = ["ascentStyle", "rating", "suggestedGrade", "gradeFeel"] as const;

function readJournalFormData(formData: FormData) {
  return { ...pickFormFields(formData, JOURNAL_FORM_FIELDS), tags: formData.getAll("tag") };
}

function readSendFormData(
  formData: FormData,
  entryDate: string,
  comment: string | null,
): RawSendInput {
  return { ...pickFormFields(formData, SEND_FORM_FIELDS), dateSent: entryDate, comment };
}

function carriesSendFields(formData: FormData): boolean {
  return SEND_FORM_FIELDS.some((field) => {
    const value = formData.get(field);
    return value !== null && value !== "";
  });
}

async function requireJournalSession() {
  const session = await requireSession();
  if (!(await allowJournalWrite(session.user.id))) {
    throw new ActionError("You're logging entries faster than we can save them — give it a minute");
  }
  return session;
}

async function requireClimb(db: Database, climbId: number) {
  const climb = await getClimb(db, climbId);
  if (!climb) throw new ActionError("Climb not found");
  return climb;
}

function entryValues(userId: string, input: JournalEntryInput) {
  return {
    userId,
    kind: input.kind,
    climbId: input.climbId,
    sent: input.sent,
    entryDate: input.entryDate,
    body: input.body,
    tags: input.tags,
  };
}

async function writeAscent(
  db: Database,
  userId: string,
  input: JournalEntryInput,
  climb: { id: number; areaId: number; type: ClimbType },
  formData: FormData,
  companions: string[] | undefined,
) {
  const sendInput = validateSendInput(
    climb.type,
    readSendFormData(formData, input.entryDate, input.body),
  );

  await saveJournalBatch(db, [
    buildSendInsert(db, { userId, climbId: climb.id, climbType: climb.type, input: sendInput }),
    buildSentJournalInsert(db, {
      ...entryValues(userId, input),
      climbId: climb.id,
      isAscent: true,
    }),
    ...(companions?.length ? [buildCompanionInsert(db, userId, companions)] : []),
  ]);

  revalidateJournalSurfaces({ userId, climbIds: [climb.id] });
  revalidateSendSurfaces({ userIds: [userId], climbIds: [climb.id], areaIds: [climb.areaId] });
}

export async function createJournalEntry(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    const db = await getDb();

    const input = validateJournalInput(readJournalFormData(formData));
    const companions = readCompanionSelection(formData);
    const climb = input.climbId === null ? null : await requireClimb(db, input.climbId);

    if (input.sent && climb) {
      const existingSend = await getUserSendForClimb(db, session.user.id, climb.id);
      if (!existingSend) {
        await writeAscent(db, session.user.id, input, climb, formData, companions);
        refresh();
        return;
      }
      if (carriesSendFields(formData)) {
        throw new ActionError("A repeat doesn't carry a rating or a grade");
      }

      const sentEntries = await getSentJournalEntries(db, session.user.id, [climb.id]);
      if (!sentEntries.some((entry) => entry.isAscent) && existingSend.dateSent !== null) {
        const dateSent = existingSend.dateSent;
        const comment = existingSend.comment;
        if (input.entryDate < dateSent) {
          throw new ActionError("A repeat can't be earlier than the recorded ascent");
        }
        const entry = { ...entryValues(session.user.id, input), climbId: climb.id };
        // A dated send can predate the journal rollout. Recover its ascent
        // before the repeat so the original date and note remain authoritative.
        const entries = [journalEntryFromSend(session.user.id, climb.id, dateSent, comment), entry];
        try {
          await saveJournalBatch(db, [
            buildMirroredSendUpdate(db, {
              userId: session.user.id,
              climbId: climb.id,
              sendId: existingSend.id,
              values: { dateSent, comment },
              ascentEntryId: null,
            }),
            buildSentJournalInsert(db, entries),
            ...(companions?.length ? [buildCompanionInsert(db, session.user.id, companions)] : []),
          ]);
        } catch (error) {
          rethrowJournalSendInvariant(
            error,
            "The send changed while this entry was being saved — try again",
          );
        }
        revalidateJournalSurfaces({ userId: session.user.id, climbIds: [climb.id] });
        revalidateSendSurfaces({
          userIds: [session.user.id],
          climbIds: [climb.id],
          areaIds: [climb.areaId],
        });
        refresh();
        return;
      }
      assertRepeatDate(sentEntries, input.entryDate);
    }

    try {
      await saveJournalBatch(db, [
        input.sent && climb
          ? buildSentJournalInsert(db, {
              ...entryValues(session.user.id, input),
              climbId: climb.id,
            })
          : db.insert(journalEntries).values(entryValues(session.user.id, input)),
        ...(companions?.length ? [buildCompanionInsert(db, session.user.id, companions)] : []),
      ]);
    } catch (error) {
      rethrowJournalSendInvariant(
        error,
        "The send changed while this entry was being saved — try again",
      );
    }
    revalidateJournalSurfaces({
      userId: session.user.id,
      climbIds: climb ? [climb.id] : [],
    });
    refresh();
  });
}

export async function updateJournalEntry(
  entryId: number,
  formData: FormData,
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    const db = await getDb();

    const existing = await getJournalEntry(db, entryId, session.user.id);
    if (!existing) throw new ActionError("Entry not found");

    const input = validateJournalInput(readJournalFormData(formData));
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

    const journalStatement = db
      .update(journalEntries)
      .set({
        kind: input.kind,
        entryDate: input.entryDate,
        body: input.body,
        tags: input.tags,
      })
      .where(eq(journalEntries.id, entryId));

    const companionStatements = buildCompanionReplacement(db, session.user.id, entryId, companions);

    try {
      await saveJournalBatch(db, [
        buildJournalEntryGuard(db, existing),
        journalStatement,
        ...companionStatements,
        ...(existing.isAscent && existing.climbId !== null
          ? [
              db
                .update(sends)
                .set({ comment: input.body })
                .where(and(eq(sends.userId, session.user.id), eq(sends.climbId, existing.climbId))),
            ]
          : []),
      ]);
    } catch (error) {
      rethrowJournalSendInvariant(error, "The entry changed — refresh and try again");
    }

    if (existing.isAscent && existing.climbId !== null) {
      const climb = await getClimb(db, existing.climbId);
      revalidateSendSurfaces({
        userIds: [session.user.id],
        climbIds: [existing.climbId],
        areaIds: climb ? [climb.areaId] : [],
      });
    }

    revalidateJournalSurfaces({
      userId: session.user.id,
      climbIds: existing.climbId === null ? [] : [existing.climbId],
    });
    refresh();
  });
}

export async function deleteJournalEntry(entryId: number): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    const db = await getDb();

    const existing = await getJournalEntry(db, entryId, session.user.id);
    if (!existing) throw new ActionError("Entry not found");

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
      rethrowJournalSendInvariant(error, "The entry changed — refresh and try again");
    }

    if (existing.isAscent && climbId !== null) {
      const climb = await getClimb(db, climbId);
      revalidateSendSurfaces({
        userIds: [session.user.id],
        climbIds: [climbId],
        areaIds: climb ? [climb.areaId] : [],
      });
    }

    revalidateJournalSurfaces({
      userId: session.user.id,
      climbIds: climbId === null ? [] : [climbId],
    });
    refresh();
  });
}
