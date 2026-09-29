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

/** The reader's own day, which decides whether a trip is upcoming or on now. */
export async function tripToday() {
  return goalToday(await getRequestTimezone());
}

/** The trip a signed-out reader's profile link opens, read as nobody: its
 * sends and its notes, and none of what the journal's audiences decide. */
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
      /** Whether this reader gets the trip's entries, which follow the
       * journal's audience. */
      journalVisible: boolean;
      /** Whether this reader gets the trip's notes, which are for friends
       * and for whoever holds the climber's profile link. */
      notesVisible: boolean;
      /** The profile link in the address, unchecked: every read that takes
       * it checks it. */
      share: string | null;
    };

/**
 * The authorization every trip page repeats, in one place. A trip opens to
 * whoever may see the climber's sends, shows its entries to whoever may read
 * their journal, and shows its notes to their friends and to whoever came by
 * their profile link. The
 * signed-out / refused split and the reason for returning `{ ok: false }`
 * rather than calling `notFound()` are resolveProfilePage's.
 */
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

/** The trip's shared album, for the page a reader lands on. It waits on
 * Google behind its own boundary, so the trip never does. */
export function tripPhotos(trip: Pick<TripSummary, "albumUrl">) {
  if (!trip.albumUrl) return null;
  return (
    <Suspense fallback={<Skeleton className="h-56 w-full sm:h-72" />}>
      <TripAlbum link={trip.albumUrl} />
    </Suspense>
  );
}

/** The trip's dates in place of whatever the URL asked for. A trip is a claim
 * about two dates, so `?dateFrom=` can neither widen nor narrow it. */
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
