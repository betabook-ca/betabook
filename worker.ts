import handler from "vinext/server/app-router-entry";
import { cloneRequestWithHeaders } from "vinext/server/request-pipeline";

import { runScheduledCatalogExport } from "@/lib/catalog-export";
import { REQUEST_TIMEZONE_HEADER, withRequestTimezone } from "@/lib/request-timezone";
import { withSecurityHeaders } from "@/lib/security-headers";

/** Worker entrypoint (wrangler.jsonc#main). Vite bundles it with the app, so
 * it wraps vinext's App Router handler rather than replacing it: the cron
 * handler lives here, and so does what the framework can't do per request —
 * handing pages an edge fact through `next/headers`, and keeping the
 * security headers on responses built without next.config.ts. */
export default {
  async fetch(request, env, ctx) {
    // Rebuilt only when the timezone header changes: vinext clones the request
    // again itself. `cloneRequestWithHeaders` rather than `new Request()`,
    // which drops `request.cf` for everything downstream.
    const headers = withRequestTimezone(request.headers, request.cf?.timezone);
    const forwarded =
      headers.get(REQUEST_TIMEZONE_HEADER) === request.headers.get(REQUEST_TIMEZONE_HEADER)
        ? request
        : cloneRequestWithHeaders(request, headers);
    // vinext declares `env` against the DOM `Request` type rather than
    // workers-types', so the ASSETS binding never matches it structurally.
    const vinextEnv = env as unknown as Parameters<typeof handler.fetch>[1];
    return withSecurityHeaders(await handler.fetch(forwarded, vinextEnv, ctx));
  },
  // `await`, not `ctx.waitUntil`: a thrown export error must surface as a
  // failed cron invocation in the dashboard, not a swallowed rejection.
  async scheduled(_controller, env) {
    await runScheduledCatalogExport(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;
