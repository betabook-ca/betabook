import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  MEMBER_CONTENT_METADATA,
  canReadUserJournal,
  resolveProfilePage,
  resolveSharedProfile,
  type ProfileUser,
} from "@/app/users/[id]/profile-shell";
import { TripAlbum } from "@/components/trips/trip-album";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db/client";
import { canReadTripNotes, getTripForUser, type TripSummary } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { parseId } from "@/lib/parse-id";
import { PROFILE_SHARE_PARAM } from "@/lib/profile-share";
import { requestMemo } from "@/lib/request-memo";
import { getRequestTimezone } from "@/lib/request-timezone";
import { parseShareToken } from "@/lib/share-token";
import type { UrlParamsRecord } from "@/lib/url-params";

/** Cached per request so a page and its `generateMetadata` resolve the same
 * trip with one read rather than two. */
const getTripFor = requestMemo(
  async (userId: string, tripId: number, viewerId: string | null, share: string | null) =>
    getTripForUser(await getDb(), userId, tripId, viewerId, share),
);

const canReadNotes = requestMemo(async (userId: string, viewerId: string, share: string | null) =>
  canReadTripNotes(await getDb(), userId, viewerId, share),
);

/** Today's date in the viewer's timezone. Decides whether a trip is upcoming or
 * in progress. */
export async function tripToday() {
  return goalToday(await getRequestTimezone());
}

/** Resolves a trip for a signed-out visitor with a share link. Loaded with a
 * null viewer, so journal-gated data is left out. The token allows reading
 * notes. */
export async function resolveSharedTrip(
  idParam: string,
  tripIdParam: string,
  search: UrlParamsRecord,
) {
  const owner = await resolveSharedProfile(idParam, search);
  const tripId = parseId(tripIdParam);
  if (!owner || tripId === null) return null;
  const trip = await getTripFor(owner.id, tripId, null, owner.token);
  return trip ? { owner, trip } : null;
}

export type TripPageParams = {
  params: Promise<{ id: string; tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Resolved =
  | { ok: false }
  | {
      ok: true;
      trip: TripSummary;
      user: ProfileUser;
      viewerId: string;
      today: string;
      /** Whether the viewer can see journal-gated data: entry counts and tagged
       * friends. */
      journalVisible: boolean;
      /** Whether the viewer can read trip notes: friends, or anyone with the
       * share link. */
      notesVisible: boolean;
      /** Share token from the URL. Not validated here; the queries that use it
       * validate it. */
      share: string | null;
    };

/** Shared authorization for trip pages. Anyone who can see the user's sends can
 * open the trip. Journal access adds entry counts and tagged friends. Friends
 * and share link holders can read notes. Signed-out and refused cases are
 * handled as in resolveProfilePage. */
export async function resolveTripPage(
  idParam: string,
  tripIdParam: string,
  search: UrlParamsRecord = {},
): Promise<{ signedIn: false } | ({ signedIn: true } & Resolved)> {
  const resolved = await resolveProfilePage(idParam, "viewer");
  if (!resolved.signedIn || !resolved.ok) return resolved;

  const tripId = parseId(tripIdParam);
  if (tripId === null) return { signedIn: true, ok: false };

  const { user, viewerId } = resolved;
  const share = parseShareToken(search[PROFILE_SHARE_PARAM]);
  const [trip, journalVisible, notesVisible, today] = await Promise.all([
    getTripFor(user.id, tripId, viewerId, share),
    canReadUserJournal(user.id, viewerId),
    canReadNotes(user.id, viewerId, share),
    tripToday(),
  ]);
  return trip
    ? { signedIn: true, ok: true, trip, user, viewerId, today, journalVisible, notesVisible, share }
    : { signedIn: true, ok: false };
}

/** Every trip page is noindex, like the rest of the profile, and a refused one
 * 404s from metadata too so a dead link previews as nothing. */
export async function tripMetadata(
  idParam: string,
  tripIdParam: string,
  search: UrlParamsRecord = {},
): Promise<Metadata> {
  const resolved = await resolveTripPage(idParam, tripIdParam, search);
  if (!resolved.signedIn) return MEMBER_CONTENT_METADATA;
  if (!resolved.ok) notFound();
  return {
    title: `${resolved.user.name} · ${resolved.trip.name}`,
    robots: { index: false },
  };
}

/** Album section for the trip page. Wrapped in Suspense so a slow response from
 * Google doesn't block the page. */
export function tripPhotos(trip: Pick<TripSummary, "albumUrl">) {
  if (!trip.albumUrl) return null;
  return (
    <Suspense fallback={<Skeleton className="h-56 w-full sm:h-72" />}>
      <TripAlbum link={trip.albumUrl} />
    </Suspense>
  );
}

/** Replaces any date filter with the trip's dates, so URL params can't change
 * the range. */
export function withTripWindow<Filter extends object>(
  filter: Filter,
  trip: Pick<TripSummary, "startDate" | "endDate">,
) {
  return {
    ...filter,
    date: undefined,
    dateFrom: trip.startDate,
    dateTo: trip.endDate,
    datePreset: undefined,
  };
}
