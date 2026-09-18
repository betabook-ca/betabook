/** Type surface for the Worker `opennextjs-cloudflare build` writes to
 * `.open-next/worker.js`. That directory is gitignored and CI typechecks before
 * it builds, so `worker.ts` reaches the generated module through the
 * `#open-next/worker` subpath import in package.json: TypeScript follows its
 * `types` condition here, wrangler's bundler follows `default` to the real
 * file. Keeping tsc off the generated JS also keeps the 12 MB server handler
 * it imports out of every typecheck (`allowJs` would otherwise pull it in). */
declare const handler: {
  fetch: ExportedHandlerFetchHandler<CloudflareEnv>;
};
export default handler;

type DurableObjectClass = new (state: DurableObjectState, env: CloudflareEnv) => DurableObject;
export declare const DOQueueHandler: DurableObjectClass;
export declare const DOShardedTagCache: DurableObjectClass;
export declare const BucketCachePurge: DurableObjectClass;
