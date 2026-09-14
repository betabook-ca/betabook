import handler from "#open-next/worker";
import { runScheduledCatalogExport } from "@/lib/catalog-export";

/** Worker entrypoint (wrangler.jsonc#main). OpenNext regenerates
 * `.open-next/worker.js` from a template on every build, so the cron handler
 * lives here and reuses the generated `fetch` unchanged. */
export default {
  fetch: handler.fetch,
  // `await`, not `ctx.waitUntil`: a thrown export error must surface as a
  // failed cron invocation in the dashboard, not a swallowed rejection.
  async scheduled(_controller, env) {
    await runScheduledCatalogExport(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Only used if the OpenNext DO queue / tag cache are ever enabled; re-exported
// so switching them on is a config change rather than an entrypoint change.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "#open-next/worker";
