/** Sent on every page and route response: from next.config.ts `headers()`,
 * and filled in by worker.ts for any response the framework built without
 * them — vinext skips config headers on redirects and 404s thrown while
 * rendering. */
export const SECURITY_HEADERS = [
  // Every subdomain holds email records only. `preload` stays off: that list
  // is slow to leave.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/** `response` with any missing security header added. Values already set
 * are kept, so a route that chose its own policy keeps it. */
export function withSecurityHeaders(response: Response): Response {
  const missing = SECURITY_HEADERS.filter(({ key }) => !response.headers.has(key));
  if (missing.length === 0) return response;
  // Copied rather than mutated: a response from `fetch()` or the ASSETS
  // binding has immutable headers.
  const patched = new Response(response.body, response);
  for (const { key, value } of missing) patched.headers.set(key, value);
  return patched;
}
