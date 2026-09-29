import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import {
  resolveTripPage,
  tripMetadata,
  type TripPageParams,
} from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripHeader } from "@/components/trips/trip-header";
import { TripNotes } from "@/components/trips/trip-notes";
import { Markdown } from "@/components/ui/markdown";
import { getDb } from "@/db/client";
import { getTripNotes } from "@/db/queries";

export async function generateMetadata({ params }: TripPageParams): Promise<Metadata> {
  const { id, tripId } = await params;
  const resolved = await resolveTripPage(id, tripId);
  if (resolved.signedIn && resolved.ok && !resolved.notesVisible) notFound();
  return tripMetadata(id, tripId);
}

export default async function TripNotesPage({ params }: TripPageParams) {
  const { id, tripId } = await params;
  const resolved = await resolveTripPage(id, tripId);
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  // Refused like the journal itself is, for a reader it is not shared with.
  if (!resolved.ok || !resolved.notesVisible) notFound();
  const { trip, user, viewerId, today, journalVisible } = resolved;

  const notes = await getTripNotes(await getDb(), user.id, trip.id, viewerId);

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripHeader
        trip={trip}
        userId={user.id}
        viewerId={viewerId}
        today={today}
        current="notes"
        journalVisible={journalVisible}
        notesVisible
      >
        <TripNotes tripId={trip.id} notes={notes} canEdit={viewerId === user.id}>
          {notes && <Markdown>{notes}</Markdown>}
        </TripNotes>
      </TripHeader>
    </ProfileHeader>
  );
}
