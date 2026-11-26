import { activeShardCount } from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

// Reads live D1 row counts, so it can't be prerendered — same reason as
// app/sitemap.ts.
export const dynamic = "force-dynamic";

/** Sitemap index. `app/sitemap.ts` serves the numbered shards at
 * /sitemap/N.xml but Next writes nothing that ties them together — this
 * does, linking exactly the shards that hold data. It's the URL to submit
 * to Search Console. */
export async function GET() {
  const count = await activeShardCount();
  const entries = Array.from(
    { length: count },
    (_, id) => `  <sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`,
  ).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
