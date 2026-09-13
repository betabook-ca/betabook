import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/db/client";
import { journalCompanions } from "@/db/schema";
import { ActionError } from "@/lib/action-result";

/** Must immediately follow the journal insert in the same D1 batch. MATERIALIZED
 * captures the journal ID once before companion inserts change last_insert_rowid. */
export function buildCompanionInsert(
  db: Database,
  ownerId: string,
  ids: string[],
  entryId: SQL = sql`last_insert_rowid()`,
) {
  return db
    .insert(journalCompanions)
    .select(sql`
    WITH entry AS MATERIALIZED (SELECT ${entryId} AS id)
    SELECT entry.id, selection.value, min(${ownerId}, selection.value), max(${ownerId}, selection.value), 0
    FROM entry CROSS JOIN json_each(${JSON.stringify(ids)}) selection WHERE true
  `)
    .onConflictDoNothing();
}

export function buildCompanionReplacement(
  db: Database,
  ownerId: string,
  entryId: number,
  ids: string[] | undefined,
) {
  if (ids === undefined) return [];
  return [
    db
      .delete(journalCompanions)
      .where(
        and(
          eq(journalCompanions.entryId, entryId),
          eq(journalCompanions.suppressed, false),
          ids.length ? notInArray(journalCompanions.userId, ids) : undefined,
        ),
      ),
    buildCompanionInsert(db, ownerId, ids, sql`${entryId}`),
  ];
}

function rethrowCompanionError(error: unknown): never {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause.message.includes("journal companion:"))
      throw new ActionError(
        "A selected friend is no longer available for this entry. Refresh and update your tagged friends.",
      );
  }
  throw error;
}

export async function saveJournalBatch(
  db: Database,
  statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
) {
  try {
    return await db.batch(statements);
  } catch (error) {
    rethrowCompanionError(error);
  }
}
