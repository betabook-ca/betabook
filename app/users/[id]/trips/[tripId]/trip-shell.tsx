import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  MEMBER_CONTENT_METADATA,
  resolveProfilePage,
  type ProfileUser,
} from "@/app/users/[id]/profile-shell";
import { getDb } from "@/db/client";
import { getTripForOwner, getTripShareForOwner, type TripSummary } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { parseId } from "@/lib/parse-id";

/** Cached per request so a page and its `generateMetadata` resolve the same
 * trip with one read rather than two. */
const getTripFor = cache(async (ownerId: string, tripId: number) =>
  getTripForOwner(await getDb(), ownerId, tripId),
);

/** The trip's link and the origin to build it against, resolved once here so
 * every tab's header shows the same thing. `getTripShareForOwner` is the only
 * read that hands out a token, and it is scoped to the owner. */
export async function getTripShareContext(ownerId: string, tripId: number) {
  const [share, shareOrigin] = await Promise.all([
    getTripShareForOwner(await getDb(), ownerId, tripId),
    getBaseUrl(),
  ]);
  return { share, shareOrigin };
}

export type TripPageParams = {
  params: Promise<{ id: string; tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Resolved = { ok: false } | { ok: true; trip: TripSummary; user: ProfileUser };

/**
 * The authorization every trip page repeats, in one place: the profile's
 * owner-only gate (there is no audience that opens a trip to anyone else),
 * then the trip itself. The signed-out / refused split and the reason for
 * returning `{ ok: false }` rather than calling `notFound()` are
 * resolveProfilePage's.
 */
export async function resolveTripPage(
  idParam: string,
  tripIdParam: string,
): Promise<{ signedIn: false } | ({ signedIn: true } & Resolved)> {
  const resolved = await resolveProfilePage(idParam, "owner");
  if (!resolved.signedIn || !resolved.ok) return resolved;

  const tripId = parseId(tripIdParam);
  if (tripId === null) return { signedIn: true, ok: false };

  const trip = await getTripFor(resolved.user.id, tripId);
  return trip
    ? { signedIn: true, ok: true, trip, user: resolved.user }
    : { signedIn: true, ok: false };
}

/** Every trip page is noindex, like the rest of the profile, and a refused one
 * 404s from metadata too so a dead link previews as nothing. */
export async function tripMetadata(idParam: string, tripIdParam: string): Promise<Metadata> {
  const resolved = await resolveTripPage(idParam, tripIdParam);
  if (!resolved.signedIn) return MEMBER_CONTENT_METADATA;
  if (!resolved.ok) notFound();
  return { title: `${resolved.trip.name} · Trips`, robots: { index: false } };
}
