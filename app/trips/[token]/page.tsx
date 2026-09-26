import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { expiredLinkCard } from "@/components/expired-link-card";
import { SharedTrip } from "@/components/shared-trip";
import { getDb } from "@/db/client";
import { getSharedTrip, getSharedTripEntries, getSharedTripSends } from "@/db/queries";
import { sharedTripMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import { tripSharePath } from "@/lib/trip-share";

const getSharedTripByToken = cache(async (token: string) => getSharedTrip(await getDb(), token));

type SharedTripPageProps = {
  params: Promise<{ token: string }>;
};

/** A trip link carries no audience, so there is no session to consult before
 * deciding what a reader may see: holding the token is the permission. The
 * session is read only to decide whether to show a sign-up prompt. */
export async function generateMetadata(props: SharedTripPageProps): Promise<Metadata> {
  const token = parseShareToken((await props.params).token);
  if (!token) return { title: "Shared trip", robots: { index: false } };

  const { trip } = await getSharedTripByToken(token);
  return trip
    ? sharedTripMetadata(trip.ownerName, trip.name)
    : { title: "Shared trip", robots: { index: false } };
}

export default async function SharedTripPage(props: SharedTripPageProps) {
  const token = parseShareToken((await props.params).token);
  if (!token) notFound();

  const db = await getDb();
  // The session decides the sign-up prompt, not what may be read, so it does
  // not gate the trip read and rides alongside it.
  const [access, session] = await Promise.all([getSharedTripByToken(token), getMemberSession()]);

  if (access.status === "expired") return expiredLinkCard("trips");
  if (access.status === "hidden") notFound();

  // Fetched only once the link is known good, and re-running the predicate
  // themselves, so entries are never selected for a reader who may not read
  // them -- including a share revoked between the statements.
  const [entries, sends] = await Promise.all([
    getSharedTripEntries(db, token),
    getSharedTripSends(db, token),
  ]);

  return (
    <SharedTrip
      trip={access.trip}
      entries={entries}
      sends={sends}
      signedIn={session !== null}
      path={tripSharePath(token)}
    />
  );
}
