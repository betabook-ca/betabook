import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharedTrip } from "@/components/shared-trip";
import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getSharedTrip, getSharedTripEntries, getSharedTripSends } from "@/db/queries";
import { sharedTripMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { SITE_NAME } from "@/lib/site";
import { parseTripShareToken, tripSharePath } from "@/lib/trip-share";

type SharedTripPageProps = {
  params: Promise<{ token: string }>;
};

/** A trip link carries no audience, so there is no session to consult before
 * deciding what a reader may see: holding the token is the permission. The
 * session is read only to decide whether to show a sign-up prompt. */
export async function generateMetadata(props: SharedTripPageProps): Promise<Metadata> {
  const token = parseTripShareToken((await props.params).token);
  if (!token) return { title: "Shared trip", robots: { index: false } };

  const db = await getDb();
  const { trip } = await getSharedTrip(db, token);
  return trip
    ? sharedTripMetadata(trip.ownerName, trip.name)
    : { title: "Shared trip", robots: { index: false } };
}

export default async function SharedTripPage(props: SharedTripPageProps) {
  const token = parseTripShareToken((await props.params).token);
  if (!token) notFound();

  const db = await getDb();
  // The session decides the sign-up prompt, not what may be read, so it does
  // not gate the trip read and rides alongside it.
  const [access, session] = await Promise.all([getSharedTrip(db, token), getMemberSession()]);

  // Described as a state of the link rather than of the trip: the reader is
  // not being refused, and nothing about the climber is disclosed either way.
  if (access.status === "expired") {
    return (
      <section aria-label="Expired link" className={`flex flex-col gap-2 ${cardClass("md")}`}>
        <PageTitle>This link has expired</PageTitle>
        <p className="text-sm text-muted">
          Shared trips on {SITE_NAME} can be set to expire. Ask the climber for a new link.
        </p>
      </section>
    );
  }
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
