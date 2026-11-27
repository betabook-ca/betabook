import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { importBatches } from "@/db/schema";

export function getImportBatchReceipt(db: Database, userId: string, batchId: string) {
  return db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.userId, userId), eq(importBatches.batchId, batchId)))
    .get();
}
