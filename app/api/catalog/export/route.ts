import { NextResponse } from "next/server";

import { withApiSession } from "@/lib/api-session";
import {
  CATALOG_EXPORT_KEY,
  catalogExportFilename,
  getCatalogExportBucket,
} from "@/lib/catalog-export";

/** Streams the latest weekly catalog snapshot (see lib/catalog-export.ts) as
 * a JSON download. The payload is the public projection, but the download
 * sits behind a session like every other data API and the /account page that
 * links to it. `withApiSession` adds `Cache-Control: private, no-store`. */
export const GET = withApiSession(async (_session, _request: Request) => {
  const bucket = await getCatalogExportBucket();
  const object = bucket ? await bucket.get(CATALOG_EXPORT_KEY) : null;
  if (!object) {
    return NextResponse.json({ error: "No catalog export yet" }, { status: 404 });
  }
  const filename = catalogExportFilename(object.customMetadata?.generatedAt);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(object.size),
      ETag: object.httpEtag,
    },
  });
});
