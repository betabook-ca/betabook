import handler from "#open-next/worker";

/** Worker entrypoint (wrangler.jsonc#main). OpenNext regenerates
 * `.open-next/worker.js` from a template on every build, so any app-level
 * handler lives here and reuses the generated `fetch` unchanged. */
export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;

// Only used if the OpenNext DO queue / tag cache are ever enabled; re-exported
// so switching them on is a config change rather than an entrypoint change.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "#open-next/worker";
