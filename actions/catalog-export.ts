"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { refresh } from "next/cache";

import { toActionResult, type ActionResult } from "@/lib/action-result";
import { runScheduledCatalogExport, type CatalogExportInfo } from "@/lib/catalog-export";
import { requireAdmin } from "@/lib/session";

/** Runs the weekly catalog export on demand. Same code path as the cron in
 * worker.ts; exists so the first snapshot after a deploy doesn't wait for
 * Monday and so the job can be exercised under `next dev`, which never fires
 * cron triggers. `refresh()` re-renders the /account card with the new
 * timestamp and counts. */
export async function generateCatalogExport(): Promise<ActionResult<CatalogExportInfo>> {
  return toActionResult(async () => {
    await requireAdmin();
    const { env } = await getCloudflareContext({ async: true });
    const info = await runScheduledCatalogExport(env);
    refresh();
    return info;
  });
}
