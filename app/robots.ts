import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Cloudflare prepends its managed AI crawler policy to this static response.
// Prefix rules include ?next= variants without excluding the public catalog.
// Any homepage query is a search state; area queries are filters/sorts/pages.
// noindex on the auth pages remains useful, but cannot prevent render costs.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/sign-in", "/sign-up", "/?", "/areas/*?", "/api/public/search/"],
    },
    sitemap: `${SITE_URL}/sitemap-index.xml`,
  };
}
