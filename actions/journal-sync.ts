import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { journalEntries } from "@/db/schema";
import { ActionError } from "@/lib/action-result";

const JOURNAL_SEND_INVARIANT_ERRORS = [
  "journal/send invariant:",
  "NOT NULL constraint failed: journal_entries.user_id",
  "NOT NULL constraint failed: sends.user_id",
] as const;

function isJournalSendInvariantFailure(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (JOURNAL_SEND_INVARIANT_ERRORS.some((message) => current.message.includes(message))) {
      return true;
    }
  }
  return false;
}

export function rethrowJournalSendInvariant(error: unknown, message: string): never {
  if (isJournalSendInvariantFailure(error)) throw new ActionError(message);
  throw error;
}

/** Run first in the write batch. The primary-key check writes nothing when the
 * entry is unchanged; a moved or demoted entry aborts the batch via SQL guards. */
export function buildJournalEntryGuard(
  db: Database,
  entry: Pick<
    typeof journalEntries.$inferSelect,
    "id" | "userId" | "climbId" | "sent" | "isAscent"
  >,
) {
  return db
    .update(journalEntries)
    .set({ userId: sql`NULL`, updatedAt: sql`${journalEntries.updatedAt}` })
    .where(
      and(
        eq(journalEntries.id, entry.id),
        sql`NOT (
          ${journalEntries.userId} = ${entry.userId}
          AND ${journalEntries.climbId} IS ${entry.climbId}
          AND ${journalEntries.sent} = ${Number(entry.sent)}
          AND ${journalEntries.isAscent} = ${Number(entry.isAscent)}
        )`,
      ),
    );
}

type SentJournalInsert = Omit<typeof journalEntries.$inferInsert, "userId" | "sent"> & {
  userId: string;
  climbId: number;
  entryDate: string;
};

export function buildSentJournalInsert(
  db: Database,
  values: SentJournalInsert | SentJournalInsert[],
) {
  const rows = Array.isArray(values) ? values : [values];
  return db.insert(journalEntries).values(
    rows.map((row) => ({
      ...row,
      sent: true,
      userId: sql`(
        SELECT s.user_id
        FROM sends s
        WHERE s.user_id = ${row.userId}
          AND s.climb_id = ${row.climbId}
          AND (s.date_sent IS NULL OR ${row.entryDate} >= s.date_sent)
      )`,
    })),
  );
}

export type SentJournalEntry = Pick<
  typeof journalEntries.$inferSelect,
  "id" | "climbId" | "entryDate" | "isAscent"
>;

export function journalEntryFromSend(
  userId: string,
  climbId: number,
  entryDate: string,
  body: string | null,
) {
  return {
    userId,
    climbId,
    kind: "session" as const,
    sent: true,
    isAscent: true,
    entryDate,
    body,
    tags: null,
  };
}

export async function getSentJournalEntries(
  db: Database,
  userId: string,
  climbIds: number[],
): Promise<SentJournalEntry[]> {
  if (climbIds.length === 0) return [];

  return db
    .select({
      id: journalEntries.id,
      climbId: journalEntries.climbId,
      entryDate: journalEntries.entryDate,
      isAscent: journalEntries.isAscent,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.sent, true),
        inArray(journalEntries.climbId, climbIds),
      ),
    )
    .orderBy(asc(journalEntries.climbId), asc(journalEntries.entryDate), asc(journalEntries.id));
}

export function groupSentJournalEntries(entries: SentJournalEntry[]) {
  const entriesByClimb = new Map<number, SentJournalEntry[]>();
  for (const entry of entries) {
    if (entry.climbId === null) continue;
    const climbEntries = entriesByClimb.get(entry.climbId) ?? [];
    climbEntries.push(entry);
    entriesByClimb.set(entry.climbId, climbEntries);
  }
  return entriesByClimb;
}

export function assertAscentDateChange(entries: SentJournalEntry[], entryDate: string) {
  if (entries.some((entry) => !entry.isAscent && entry.entryDate < entryDate)) {
    throw new ActionError("The ascent date can't be later than a logged repeat");
  }
}

export function assertRepeatDate(entries: SentJournalEntry[], entryDate: string) {
  const ascent = entries.find((entry) => entry.isAscent);
  if (ascent && entryDate < ascent.entryDate) {
    throw new ActionError("A repeat can't be earlier than the recorded ascent");
  }
}
