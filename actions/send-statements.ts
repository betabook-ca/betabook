import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { sends } from "@/db/schema";
import type { ClimbType } from "@/lib/grades";
import type { SendInput } from "@/lib/sends";

type SendInsert = {
  userId: string;
  climbId: number;
  climbType: ClimbType;
  input: Omit<SendInput, "suggestedGrade"> & { suggestedGrade: number | null };
};

export function buildSendInsert(db: Database, values: SendInsert | SendInsert[]) {
  const rows = Array.isArray(values) ? values : [values];
  return db.insert(sends).values(
    rows.map(({ userId, climbId, climbType, input }) => ({
      userId,
      climbId: sql`(SELECT c.id FROM climbs c WHERE c.id = ${climbId} AND c.type = ${climbType})`,
      ascentStyle: input.ascentStyle,
      dateSent: input.dateSent,
      comment: input.comment,
      rating: input.rating,
      suggestedGrade: input.suggestedGrade,
      gradeFeel: input.gradeFeel,
    })),
  );
}

type SendUpdateValues = Partial<typeof sends.$inferInsert> & {
  dateSent: string | null;
  comment: string | null;
};

export function buildMirroredSendUpdate(
  db: Database,
  {
    userId,
    climbId,
    climbType,
    sendId,
    values,
    ascentEntryId,
  }: {
    userId: string;
    climbId: number;
    climbType?: ClimbType;
    sendId?: number;
    values: SendUpdateValues;
    ascentEntryId: number | null;
  },
) {
  const mirrorGuard = sql`(
    ${
      ascentEntryId === null
        ? sql`NOT EXISTS (
          SELECT 1 FROM journal_entries j
          WHERE j.user_id = ${userId} AND j.climb_id = ${climbId} AND j.is_ascent = 1
        )`
        : sql`${values.dateSent} IS NOT NULL AND EXISTS (
          SELECT 1 FROM journal_entries j
          WHERE j.user_id = ${userId} AND j.climb_id = ${climbId}
            AND j.is_ascent = 1 AND j.id = ${ascentEntryId}
        )`
    }
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries j
      WHERE j.user_id = ${userId} AND j.climb_id = ${climbId}
        AND j.sent = 1 AND j.is_ascent = 0 AND j.entry_date < ${values.dateSent}
    )
    ${
      climbType === undefined
        ? sql``
        : sql`AND EXISTS (
            SELECT 1 FROM climbs c WHERE c.id = ${climbId} AND c.type = ${climbType}
          )`
    }
  )`;
  const identity = [eq(sends.userId, userId), eq(sends.climbId, climbId)];
  if (sendId !== undefined) identity.push(eq(sends.id, sendId));

  return db
    .update(sends)
    .set({
      ...values,
      userId: sql`(
        SELECT s.user_id
        FROM sends s
        WHERE s.user_id = ${userId} AND s.climb_id = ${climbId} AND ${mirrorGuard}
      )`,
    })
    .where(and(...identity));
}
