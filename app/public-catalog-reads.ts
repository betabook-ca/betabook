import { cache } from "react";

import { getDb } from "@/db/client";
import { getPublicAncestors, getPublicArea, getPublicClimb } from "@/db/queries/public-catalog";

// generateMetadata and the page both read these on a signed-out request.

export const getPublicAreaById = cache(async (id: number) => getPublicArea(await getDb(), id));

export const getPublicClimbById = cache(async (id: number) => getPublicClimb(await getDb(), id));

export const getPublicAncestorsById = cache(async (areaId: number) => {
  const area = await getPublicAreaById(areaId);
  return area ? getPublicAncestors(await getDb(), area) : [];
});
