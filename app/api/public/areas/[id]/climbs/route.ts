import { getDb } from "@/db/client";
import {
  getPublicArea,
  resolvePublicSubarea,
  searchPublicClimbs,
} from "@/db/queries/public-catalog";
import { parseId } from "@/lib/parse-id";
import { hasProtectedCatalogParams, publicCatalogOptions } from "@/lib/public-catalog";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const search = new URL(request.url).searchParams;
  if (hasProtectedCatalogParams(search, { climbFilters: true }))
    return Response.json(
      { error: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  const id = parseId((await params).id);
  const db = await getDb();
  const area = id === null ? undefined : await getPublicArea(db, id);
  if (!area) return Response.json({ error: "Area not found" }, { status: 404 });
  const scope = await resolvePublicSubarea(db, area, parseId(search.get("subarea") ?? ""));
  return Response.json(
    await searchPublicClimbs(db, { ...publicCatalogOptions(search), areaId: scope.id }),
  );
}
