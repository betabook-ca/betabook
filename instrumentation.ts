import type { Instrumentation } from "next";

import { logRequestError } from "@/lib/error-reporting";

/** vinext calls this for every server error: page renders (including errors
 * the RSC stream hides behind a digest), server actions, route handlers and
 * middleware. Without it a production render error leaves no log line. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logRequestError(error, request, context);
};
