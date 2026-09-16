"use server";

import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { refresh } from "next/cache";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { getDb, type Database } from "@/db/client";
import {
  findClimbCandidatesByNames,
  findClimbCandidatesInAreas,
  getClimbsByIds,
  getImportBatchReceipt,
  getUserSentClimbIds,
  type ClimbCandidate,
} from "@/db/queries";
import { importBatches, journalEntries } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { parseGrade, type ClimbType } from "@/lib/grades";
import type { ImportBatchResponse } from "@/lib/import-execution";
import {
  IMPORT_BATCH_SIZE,
  RESOLVE_BATCH_SIZE,
  validateImportSendValues,
  type ImportSendRow,
  type ImportResult,
  type ImportOptions,
  type SendInput,
} from "@/lib/sends";
import { requireSession } from "@/lib/session";

import {
  assertAscentDateChange,
  buildSentJournalInsert,
  getSentJournalEntries,
  groupSentJournalEntries,
  journalEntryFromSend,
  rethrowJournalSendInvariant,
} from "./journal-sync";
import { afterCommit } from "./post-commit";
import { revalidateJournalSurfaces, revalidateSendSurfaces } from "./revalidation";
import { buildMirroredSendUpdate, buildSendInsert } from "./send-statements";

export type { ImportResult, ImportOptions } from "@/lib/sends";

type SendValues = Omit<SendInput, "suggestedGrade"> & { suggestedGrade: number | null };

// A guarded journal insert binds 11 values per row; nine fit D1's 100-parameter limit.
const INSERT_CHUNK_SIZE = 9;

/** Authenticated batch lookup for the import wizard; results are capped per name. */
export async function resolveImportClimbs(
  names: string[],
): Promise<ActionResult<ClimbCandidate[]>> {
  return toActionResult(async () => {
    await requireSession();

    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      throw new ActionError("Invalid climb names");
    }
    if (names.length > RESOLVE_BATCH_SIZE) {
      throw new ActionError(`A lookup can carry at most ${RESOLVE_BATCH_SIZE} climb names`);
    }

    const db = await getDb();
    return findClimbCandidatesByNames(db, names);
  });
}

/** Resolve rows omitted by the name-only cap using their area hints. */
export async function resolveImportClimbsInAreas(
  pairs: { name: string; areaName: string }[],
): Promise<ActionResult<ClimbCandidate[]>> {
  return toActionResult(async () => {
    await requireSession();

    if (
      !Array.isArray(pairs) ||
      pairs.some((pair) => typeof pair?.name !== "string" || typeof pair?.areaName !== "string")
    ) {
      throw new ActionError("Invalid climb names");
    }
    if (pairs.length > RESOLVE_BATCH_SIZE) {
      throw new ActionError(
        `A lookup can carry at most ${RESOLVE_BATCH_SIZE} climb and area pairs`,
      );
    }

    const db = await getDb();
    return findClimbCandidatesInAreas(db, pairs);
  });
}

function parseClimbId(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ActionError("Invalid import rows");
  }
  return value;
}

function validateImportOptions(options: ImportOptions) {
  if (
    !options ||
    !["skip", "overwrite"].includes(options.onConflict) ||
    !["native", "converted"].includes(options.gradeScale) ||
    (options.batchId !== undefined &&
      (typeof options.batchId !== "string" ||
        options.batchId.length === 0 ||
        options.batchId.length > 128))
  ) {
    throw new ActionError("Invalid import options");
  }
  return options.batchId ?? crypto.randomUUID();
}

type ImportReceipt = typeof importBatches.$inferInsert;

async function readImportReceipt(db: Database, identity: Omit<ImportReceipt, "result">) {
  const receipt = await getImportBatchReceipt(db, identity.userId, identity.batchId);
  if (receipt && receipt.requestHash !== identity.requestHash) {
    throw new ActionError("This import batch ID was already used for different rows");
  }
  return receipt?.result;
}

async function commitImportBatch(
  db: Database,
  receipt: ImportReceipt,
  statements: BatchItem<"sqlite">[],
): Promise<ImportResult | null> {
  try {
    await db.batch([db.insert(importBatches).values(receipt), ...statements]);
    return receipt.result;
  } catch (error) {
    // A concurrent retry may have committed this receipt first.
    try {
      const committed = await readImportReceipt(db, receipt);
      if (committed) return committed;
    } catch (lookupError) {
      if (lookupError instanceof ActionError) throw lookupError;
      return null;
    }
    // SQLite errors confirm rollback. A lost database response does not.
    for (let cause = error; cause instanceof Error; cause = cause.cause) {
      if (cause.message.includes("SQLITE_")) {
        rethrowJournalSendInvariant(
          error,
          "The journal changed while these sends were being imported — try again",
        );
      }
    }
    return null;
  }
}

/** The receipt commits with the sends. Retrying the same batch ID returns
 * its original result, including in overwrite mode after a lost response. */
export async function importSends(
  rows: ImportSendRow[],
  options: ImportOptions,
): Promise<ImportBatchResponse> {
  let outcomeUnknown = false;
  const response = await toActionResult(async () => {
    const session = await requireSession();

    if (!Array.isArray(rows)) throw new ActionError("Invalid import rows");
    if (rows.length > IMPORT_BATCH_SIZE) {
      throw new ActionError(`An import batch can carry at most ${IMPORT_BATCH_SIZE} rows`);
    }
    const climbIds = rows.map((row) => parseClimbId(row?.climbId));
    const batchId = validateImportOptions(options);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({ rows, gradeScale: options.gradeScale, onConflict: options.onConflict }),
      ),
    );
    const requestHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    const db = await getDb();
    const identity = { userId: session.user.id, batchId, requestHash };
    const receipt = await readImportReceipt(db, identity);
    if (receipt) return receipt;
    const [climbList, alreadySent] = await Promise.all([
      getClimbsByIds(db, climbIds),
      getUserSentClimbIds(db, session.user.id, climbIds),
    ]);
    const climbsById = new Map(climbList.map((climb) => [climb.id, climb]));

    // First row per climb wins, including in overwrite mode.
    const processed = new Set<number>();
    const toInsert: Array<SendValues & { userId: string; climbId: number; climbType: ClimbType }> =
      [];
    const toUpdate: Array<{ climbId: number; climbType: ClimbType; values: SendValues }> = [];
    const affectedAreaIds = new Set<number>();
    const missing: number[] = [];
    let alreadyLogged = 0;

    for (const [index, row] of rows.entries()) {
      const climb = climbsById.get(climbIds[index]);
      if (!climb) {
        missing.push(index);
        continue;
      }

      if (processed.has(climb.id)) {
        alreadyLogged += 1;
        continue;
      }

      if (alreadySent.has(climb.id) && options.onConflict === "skip") {
        alreadyLogged += 1;
        continue;
      }

      // Overwrites replace every imported field, including fields the CSV clears.
      const gradeText = typeof row.gradeText === "string" ? row.gradeText : null;
      const values: SendValues = {
        ...validateImportSendValues(row, climb.type),
        // A blank Suggested Grade stays null; a Grade-only mapping falls back
        // to the posted grade. See NormalizedImportRow.blankGradeMeans.
        suggestedGrade: gradeText
          ? parseGrade(climb.type, gradeText, options.gradeScale)
          : row.blankGradeMeans === "no-suggestion"
            ? null
            : climb.grade,
      };

      processed.add(climb.id);
      affectedAreaIds.add(climb.areaId);

      if (alreadySent.has(climb.id)) {
        toUpdate.push({ climbId: climb.id, climbType: climb.type, values });
      } else {
        toInsert.push({
          userId: session.user.id,
          climbId: climb.id,
          climbType: climb.type,
          ...values,
        });
      }
    }

    const existingEntries = groupSentJournalEntries(
      await getSentJournalEntries(
        db,
        session.user.id,
        toUpdate.map(({ climbId }) => climbId),
      ),
    );
    const newSendJournalInserts = toInsert.flatMap((row) =>
      row.dateSent
        ? [journalEntryFromSend(session.user.id, row.climbId, row.dateSent, row.comment)]
        : [],
    );
    const existingSendJournalInserts: ReturnType<typeof journalEntryFromSend>[] = [];
    const journalUpdates: Array<{
      id: number;
      climbId: number;
      entryDate: string;
      body: string | null;
    }> = [];
    const mirroredEntryIdsByClimb = new Map<number, number>();

    for (const { climbId, values } of toUpdate) {
      const climbEntries = existingEntries.get(climbId) ?? [];
      const ascent = climbEntries.find((entry) => entry.isAscent);
      if (!values.dateSent) {
        if (ascent) throw new ActionError("A send with journal history must keep its date");
        continue;
      }
      assertAscentDateChange(climbEntries, values.dateSent);
      if (ascent) {
        mirroredEntryIdsByClimb.set(climbId, ascent.id);
        journalUpdates.push({
          id: ascent.id,
          climbId,
          entryDate: values.dateSent,
          body: values.comment,
        });
      } else {
        existingSendJournalInserts.push(
          journalEntryFromSend(session.user.id, climbId, values.dateSent, values.comment),
        );
      }
    }

    const sendUpdates = (withMirror: boolean) =>
      toUpdate
        .filter(({ climbId }) => mirroredEntryIdsByClimb.has(climbId) === withMirror)
        .map(({ climbId, climbType, values }) =>
          buildMirroredSendUpdate(db, {
            userId: session.user.id,
            climbId,
            climbType,
            values,
            ascentEntryId: mirroredEntryIdsByClimb.get(climbId) ?? null,
          }),
        );
    const journalInsertStatements = (entries: ReturnType<typeof journalEntryFromSend>[]) =>
      Array.from({ length: Math.ceil(entries.length / INSERT_CHUNK_SIZE) }, (_, i) =>
        buildSentJournalInsert(
          db,
          entries.slice(i * INSERT_CHUNK_SIZE, (i + 1) * INSERT_CHUNK_SIZE),
        ),
      );
    const statements = [
      ...Array.from({ length: Math.ceil(toInsert.length / INSERT_CHUNK_SIZE) }, (_, i) =>
        buildSendInsert(
          db,
          toInsert
            .slice(i * INSERT_CHUNK_SIZE, (i + 1) * INSERT_CHUNK_SIZE)
            .map(({ userId, climbId, climbType, ...input }) => ({
              userId,
              climbId,
              climbType,
              input,
            })),
        ),
      ),
      ...journalInsertStatements(newSendJournalInserts),
      ...journalUpdates.map(({ id, entryDate, body }) =>
        db.update(journalEntries).set({ entryDate, body }).where(eq(journalEntries.id, id)),
      ),
      ...sendUpdates(true),
      ...sendUpdates(false),
      ...journalInsertStatements(existingSendJournalInserts),
    ];

    const result: ImportResult = {
      imported: toInsert.length,
      overwritten: toUpdate.length,
      alreadyLogged,
      missing,
    };
    const committed = await commitImportBatch(db, { ...identity, result }, statements);
    if (!committed) {
      outcomeUnknown = true;
      throw new ActionError("The import result could not be confirmed");
    }

    if (statements.length > 0) {
      await scheduleGoalRefresh(db, session.user.id);
      afterCommit(() => {
        const affectedClimbIds = [
          ...toInsert.map((row) => row.climbId),
          ...toUpdate.map(({ climbId }) => climbId),
        ];
        revalidateSendSurfaces({
          userIds: [session.user.id],
          climbIds: affectedClimbIds,
          areaIds: affectedAreaIds,
        });
        const journalWriteCount =
          newSendJournalInserts.length + existingSendJournalInserts.length + journalUpdates.length;
        if (journalWriteCount > 0) {
          revalidateJournalSurfaces({ userId: session.user.id, climbIds: affectedClimbIds });
        }
        refresh();
      });
    }

    return committed;
  });
  return !response.ok && outcomeUnknown ? { ...response, outcome: "unknown" } : response;
}
