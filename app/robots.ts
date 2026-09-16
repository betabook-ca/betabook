import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Cloudflare prepends its managed AI crawler policy to this static response.
// Prefix rules include ?next= variants without excluding the public catalog.
// Any homepage query is a search state (now a free redirect to /search);
// /search queries are unbounded filter states; area queries are
// filters/sorts/pages. The bare /search stays crawlable: it is linked from
// every signed-out page, so Google must be able to fetch it to read its
// noindex, and one bounded first page is cheap. noindex on the auth pages
// remains useful, but cannot prevent render costs.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/sign-in", "/sign-up", "/?", "/search?", "/areas/*?", "/api/public/search/"],
    },
    sitemap: `${SITE_URL}/sitemap-index.xml`,
  };
}
