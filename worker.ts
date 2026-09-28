import handler from "vinext/server/app-router-entry";

import { runScheduledCatalogExport } from "@/lib/catalog-export";
import { REQUEST_TIMEZONE_HEADER } from "@/lib/request-timezone";

/** Worker entrypoint (wrangler.jsonc#main). Vite bundles it with the app, so
 * it wraps vinext's App Router handler rather than replacing it: the cron
 * handler lives here, and so does the one request fact pages cannot reach
 * through `next/headers` on their own. */
export default {
  fetch(request, env, ctx) {
    // Always rewritten, never trusted from the client: a page reads this
    // header as the edge's answer, and a missing zone should fall back to UTC
    // rather than to whatever the request claimed.
    const headers = new Headers(request.headers);
    const timezone = request.cf?.timezone;
    if (typeof timezone === "string" && timezone) headers.set(REQUEST_TIMEZONE_HEADER, timezone);
    else headers.delete(REQUEST_TIMEZONE_HEADER);
    // vinext declares `env` against the DOM `Request` type rather than
    // workers-types', so the ASSETS binding never matches it structurally.
    const vinextEnv = env as unknown as Parameters<typeof handler.fetch>[1];
    return handler.fetch(new Request(request, { headers }), vinextEnv, ctx);
  },
  // `await`, not `ctx.waitUntil`: a thrown export error must surface as a
  // failed cron invocation in the dashboard, not a swallowed rejection.
  async scheduled(_controller, env) {
    await runScheduledCatalogExport(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;
