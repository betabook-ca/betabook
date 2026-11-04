"use server";

import { refresh } from "next/cache";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb } from "@/db/client";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { parseEntryDate, validateJournalInput } from "@/lib/journal";
import { readCompanionSelection } from "@/lib/journal-companions";
import { readDayEntries } from "@/lib/journal-day";

import { saveJournalBatch } from "./journal-companion-statements";
import {
  carriesSendFields,
  planClimbEntry,
  readJournalFormData,
  requireClimb,
  requireJournalSession,
  SESSION_SEND_FIELDS_MESSAGE,
} from "./journal-entry-plan";
import { rethrowJournalSendInvariant } from "./journal-sync";
import { afterCommit } from "./post-commit";
import { revalidateJournalSurfaces, revalidateSendSurfaces } from "./revalidation";

function readClimbId(entry: FormData): number {
  const climbId = Number(entry.get("climbId"));
  if (!Number.isInteger(climbId) || climbId < 1) throw new ActionError("Invalid climb");
  return climbId;
}

/** Logs a day out: several climbs on one date, each with its own style, note,
 * tags, tagged friends and (for a first ascent) videos. The form's day-level
 * friends and tags only pre-filled each climb, so only the climbs' own are
 * read. The day is one D1 batch, so it saves whole or not at all. */
export async function createDayEntries(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireJournalSession();
    const userId = session.user.id;
    const db = await getDb();

    const { shared, entries } = readDayEntries(formData);
    const entryDate = parseEntryDate(shared.get("entryDate"));

    const climbIds = entries.map(readClimbId);
    const climbs = await Promise.all(climbIds.map((climbId) => requireClimb(db, climbId)));
    const seen = new Set<number>();
    for (const climb of climbs) {
      if (seen.has(climb.id)) throw new ActionError(`${climb.name} is in this day twice`);
      seen.add(climb.id);
    }

    const plans = await Promise.all(
      entries.map(async (entry, index) => {
        const climb = climbs[index];
        try {
          entry.set("kind", "session");
          entry.set("entryDate", entryDate);
          const input = validateJournalInput(readJournalFormData(entry));
          if (!input.sent && carriesSendFields(entry)) {
            throw new ActionError(SESSION_SEND_FIELDS_MESSAGE);
          }
          const companions = readCompanionSelection(entry);
          return await planClimbEntry(db, userId, input, climb, entry, companions);
        } catch (error) {
          // Name the climb: the day lists several, and the error alone can't say which.
          if (error instanceof ActionError)
            throw new ActionError(`${climb.name}: ${error.message}`);
          throw error;
        }
      }),
    );

    const [first, ...rest] = plans.flatMap((plan) => plan.statements);
    try {
      await saveJournalBatch(db, [first, ...rest]);
    } catch (error) {
      rethrowJournalSendInvariant(
        error,
        "A send changed while this day was being saved — try again",
      );
    }

    const sent = climbs.filter((_, index) => plans[index].writesSend);
    await scheduleGoalRefresh(db, userId);
    afterCommit(() => {
      revalidateJournalSurfaces({ userId, climbIds });
      if (sent.length) {
        revalidateSendSurfaces({
          userIds: [userId],
          climbIds: sent.map((climb) => climb.id),
          areaIds: [...new Set(sent.map((climb) => climb.areaId))],
        });
      }
      refresh();
    });
  });
}
