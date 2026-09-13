import { getDb } from "@/db/client";
import { searchPublicAreas } from "@/db/queries/public-catalog";
import { hasProtectedCatalogParams, publicCatalogOptions } from "@/lib/public-catalog";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (hasProtectedCatalogParams(params))
    return Response.json(
      { error: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  return Response.json(await searchPublicAreas(await getDb(), publicCatalogOptions(params)));
}
