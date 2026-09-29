import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  MEMBER_CONTENT_METADATA,
  canReadUserJournal,
  resolveProfilePage,
  resolveSharedProfile,
  type ProfileUser,
} from "@/app/users/[id]/profile-shell";
import { getDb } from "@/db/client";
import { getTripForUser, type TripSummary } from "@/db/queries";
import { parseId } from "@/lib/parse-id";
import { requestMemo } from "@/lib/request-memo";
import type { UrlParamsRecord } from "@/lib/url-params";

/** Cached per request so a page and its `generateMetadata` resolve the same
 * trip with one read rather than two. */
const getTripFor = requestMemo(async (userId: string, tripId: number, viewerId: string | null) =>
  getTripForUser(await getDb(), userId, tripId, viewerId),
);

/** The trip a signed-out reader's profile link opens, read as nobody: its
 * sends, and none of what the journal's audiences decide. */
export async function resolveSharedTrip(
  idParam: string,
  tripIdParam: string,
  search: UrlParamsRecord,
) {
  const owner = await resolveSharedProfile(idParam, search);
  const tripId = parseId(tripIdParam);
  if (!owner || tripId === null) return null;
  const trip = await getTripFor(owner.id, tripId, null);
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
      /** Whether this reader gets the trip's entries and notes. */
      journalVisible: boolean;
    };

/**
 * The authorization every trip page repeats, in one place. A trip opens to
 * whoever may see the climber's sends, and shows its entries and notes to
 * whoever may read their journal: the two gates the profile already has. The
 * signed-out / refused split and the reason for returning `{ ok: false }`
 * rather than calling `notFound()` are resolveProfilePage's.
 */
export async function resolveTripPage(
  idParam: string,
  tripIdParam: string,
): Promise<{ signedIn: false } | ({ signedIn: true } & Resolved)> {
  const resolved = await resolveProfilePage(idParam, "viewer");
  if (!resolved.signedIn || !resolved.ok) return resolved;

  const tripId = parseId(tripIdParam);
  if (tripId === null) return { signedIn: true, ok: false };

  const { user, viewerId } = resolved;
  const [trip, journalVisible] = await Promise.all([
    getTripFor(user.id, tripId, viewerId),
    canReadUserJournal(user.id, viewerId),
  ]);
  return trip
    ? { signedIn: true, ok: true, trip, user, viewerId, journalVisible }
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
