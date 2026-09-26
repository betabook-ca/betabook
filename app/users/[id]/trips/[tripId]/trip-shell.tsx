import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getUserById } from "@/app/users/[id]/profile-shell";
import { getDb } from "@/db/client";
import { getTripForOwner, getTripShareForOwner, type TripSummary } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { parseId } from "@/lib/parse-id";
import { getMemberSession } from "@/lib/session";

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

type Resolved =
  | { ok: false }
  | { ok: true; trip: TripSummary; user: { id: string; name: string; image: string | null } };

/**
 * The authorization every trip page repeats, in one place.
 *
 * Trips are owner-only, so this compares against the session's own id rather
 * than a visibility helper: there is no audience that opens a trip to anyone
 * else. A signed-out reader is reported separately from a refused one, because
 * the page shows them a sign-in callout instead of a 404.
 *
 * Returning `{ ok: false }` rather than calling `notFound()` here keeps the
 * decision at the call site, where metadata and the page need different
 * outcomes for the same state.
 */
export async function resolveTripPage(
  idParam: string,
  tripIdParam: string,
): Promise<{ signedIn: false } | ({ signedIn: true } & Resolved)> {
  const session = await getMemberSession();
  if (!session) return { signedIn: false };

  const tripId = parseId(tripIdParam);
  if (tripId === null) return { signedIn: true, ok: false };

  const user = await getUserById(idParam);
  if (!user || session.user.id !== user.id) return { signedIn: true, ok: false };

  const trip = await getTripFor(user.id, tripId);
  return trip ? { signedIn: true, ok: true, trip, user } : { signedIn: true, ok: false };
}

/** Every trip page is noindex, like the rest of the profile, and a refused one
 * 404s from metadata too so a dead link previews as nothing. */
export async function tripMetadata(idParam: string, tripIdParam: string): Promise<Metadata> {
  const resolved = await resolveTripPage(idParam, tripIdParam);
  if (!resolved.signedIn) return { title: "Member content", robots: { index: false } };
  if (!resolved.ok) notFound();
  return { title: `${resolved.trip.name} · Trips`, robots: { index: false } };
}
