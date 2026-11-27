import { permanentRedirect } from "next/navigation";

import { slugify, withQuery } from "@/lib/slug";
import type { UrlParamsRecord } from "@/lib/url-params";

/** Sends any other spelling of an entity URL (no slug, stale slug, extra
 * segments) to the canonical id + slug, query string preserved so a shared
 * filtered link still lands filtered. On this streamed Workers deployment it
 * emits a 0-second `<meta http-equiv="refresh">` rather than a 308 — Google
 * treats that as permanent, and the rendered page's rel=canonical points at
 * the same URL. */
export function redirectToCanonicalSlug(
  slug: string[] | undefined,
  name: string,
  href: string,
  search: UrlParamsRecord,
): void {
  if ((slug?.join("/") ?? "") !== slugify(name)) permanentRedirect(withQuery(href, search));
}
