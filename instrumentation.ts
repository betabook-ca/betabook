import type { Instrumentation } from "next";

import { installConsoleScrub, logRequestError } from "@/lib/error-reporting";

/** vinext runs this once, before the first request. In production every
 * `console` call is scrubbed: vinext logs some raw errors itself (route
 * handlers, server actions, middleware), and those can carry user data. Dev
 * keeps raw errors for debugging. */
export function register() {
  // oxlint-disable-next-line node/no-process-env -- vinext defines NODE_ENV at build time; the production worker inlines this to `true`
  if (process.env.NODE_ENV === "production") installConsoleScrub();
}

/** vinext calls this for every server error: page renders (including errors
 * the RSC stream hides behind a digest), server actions, route handlers and
 * middleware. Without it a production render error leaves no log line. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logRequestError(error, request, context);
};
