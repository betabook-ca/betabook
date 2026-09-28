import { env } from "cloudflare:workers";

/** The Worker's bindings and vars (wrangler.jsonc, layered with .dev.vars
 * locally). `cloudflare:workers` exposes them at module scope in every
 * context the app runs in — requests, the cron handler in worker.ts, the
 * workerd dev server and the Workers Vitest pool — so nothing here depends on
 * a framework request context.
 *
 * Async and behind this module rather than imported directly, so tests can
 * substitute individual values without standing in for the platform module. */
export async function getCloudflareEnv(): Promise<CloudflareEnv> {
  return env;
}
