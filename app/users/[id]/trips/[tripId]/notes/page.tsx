import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  getTripShareContext,
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripHeader } from "@/components/trips/trip-header";
import { TripNotes } from "@/components/trips/trip-notes";
import { Markdown } from "@/components/ui/markdown";
import { getDb } from "@/db/client";
import { getTripNotesForOwner } from "@/db/queries";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  return tripMetadata(id, tripId);
}

export default async function TripNotesPage({ params }: TripPageParams) {
  const { id, tripId } = await params;
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { trip, user } = resolved;

  const [{ share, shareOrigin }, notes] = await Promise.all([
    getTripShareContext(user.id, trip.id),
    getDb().then((db) => getTripNotesForOwner(db, user.id, trip.id)),
  ]);

  return (
    <ProfileHeader user={user} viewerId={user.id} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        current="notes"
        share={share}
        shareOrigin={shareOrigin}
      >
        <TripNotes tripId={trip.id} notes={notes}>
          {notes && <Markdown>{notes}</Markdown>}
        </TripNotes>
      </TripHeader>
    </ProfileHeader>
  );
}
