import type { ActionResult } from "@/lib/action-result";
import { IMPORT_BATCH_SIZE, type ImportResult, type ImportSendRow } from "@/lib/sends";

export type ImportBatchResponse =
  | ActionResult<ImportResult>
  | { ok: false; error: string; outcome: "unknown" };

export type ImportProgress = {
  completed: number;
  total: number;
  imported: number;
  overwritten: number;
  alreadyLogged: number;
  failed: number;
  lastError: string | null;
};

export type ImportRunResult = ImportResult & {
  broken: number[];
  duplicates: number[];
  batchErrors: { indices: number[]; message: string; uncertain: boolean }[];
  notAttempted: number[];
  stopped: { kind: "cancelled" | "aborted"; message: string } | null;
};

const UNCONFIRMED_MESSAGE =
  "The connection failed before the result could be confirmed. These rows may have saved; check your sends before importing them again.";

export async function runImportBatches(
  rows: ImportSendRow[],
  sendBatch: (rows: ImportSendRow[], batchId: string) => Promise<ImportBatchResponse>,
  {
    onProgress,
    isCancelled,
  }: { onProgress?: (progress: ImportProgress) => void; isCancelled?: () => boolean } = {},
): Promise<ImportRunResult> {
  const result: ImportRunResult = {
    imported: 0,
    overwritten: 0,
    alreadyLogged: 0,
    missing: [],
    broken: [],
    duplicates: [],
    batchErrors: [],
    notAttempted: [],
    stopped: null,
  };
  const seen = new Set<number>();
  const pending = rows.flatMap((row, index) => {
    if (seen.has(row.climbId)) {
      result.duplicates.push(index);
      return [];
    }
    seen.add(row.climbId);
    return [{ row, index }];
  });
  let next = 0;
  let consecutiveFailures = 0;
  while (next < pending.length) {
    const batch = pending.slice(next, next + IMPORT_BATCH_SIZE);
    const batchId = crypto.randomUUID();
    const submit = () =>
      sendBatch(
        batch.map(({ row }) => row),
        batchId,
      ).catch(() => ({ ok: false, error: UNCONFIRMED_MESSAGE, outcome: "unknown" }) as const);
    let response = await submit();
    // Reuse the receipt ID so a lost response cannot repeat an overwrite.
    if (!response.ok && "outcome" in response) {
      const retry = await submit();
      if (retry.ok) response = retry;
    }
    const uncertain = !response.ok && "outcome" in response;
    if (response.ok) {
      result.imported += response.value.imported;
      result.overwritten += response.value.overwritten;
      result.alreadyLogged += response.value.alreadyLogged;
      result.missing.push(...response.value.missing.map((index) => batch[index].index));
      result.broken.push(...(response.value.broken ?? []).map((index) => batch[index].index));
      consecutiveFailures = 0;
    } else {
      result.batchErrors.push({
        indices: batch.map(({ index }) => index),
        message: uncertain ? UNCONFIRMED_MESSAGE : response.error,
        uncertain,
      });
      consecutiveFailures += 1;
    }
    next += batch.length;
    onProgress?.({
      completed: next,
      total: pending.length,
      imported: result.imported,
      overwritten: result.overwritten,
      alreadyLogged: result.alreadyLogged,
      failed: result.batchErrors.reduce(
        (count, error) => count + (error.uncertain ? 0 : error.indices.length),
        0,
      ),
      lastError: response.ok ? null : response.error,
    });
    if (uncertain) {
      result.stopped = { kind: "aborted", message: UNCONFIRMED_MESSAGE };
      break;
    }
    if (next >= pending.length) break;
    if (isCancelled?.()) {
      result.stopped = { kind: "cancelled", message: "You cancelled the import." };
      break;
    }
    if (consecutiveFailures >= 3) {
      result.stopped = {
        kind: "aborted",
        message: "The import stopped after three failed batches.",
      };
      break;
    }
  }
  result.notAttempted = pending.slice(next).map(({ index }) => index);
  return result;
}
