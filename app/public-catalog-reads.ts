import { getDb } from "@/db/client";
import { getPublicAreaTrail, getPublicClimb } from "@/db/queries/public-catalog";
import { requestMemo } from "@/lib/request-memo";

// generateMetadata and the page both read these on a signed-out request, and
// an area and its ancestors are one read that both views share.

export const getPublicClimbById = requestMemo(async (id: number) =>
  getPublicClimb(await getDb(), id),
);

const getPublicAreaTrailById = requestMemo(async (id: number) =>
  getPublicAreaTrail(await getDb(), id),
);

export async function getPublicAreaById(id: number) {
  return (await getPublicAreaTrailById(id)).at(-1);
}

export async function getPublicAncestorsById(areaId: number) {
  return (await getPublicAreaTrailById(areaId)).slice(0, -1);
}
