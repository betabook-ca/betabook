import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripList } from "@/components/trips/trip-list";
import { getDb } from "@/db/client";
import { getTripsForUser } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";

type UserTripsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserTripsPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "trips");
  return memberMetadata(resolved, (user) => `${user.name} · Trips`);
}

/** The climber's trips, for their trip audience. The profile share link
 * doesn't open this list; each trip has its own link. */
export default async function UserTripsPage({ params }: UserTripsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "trips");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripsView userId={user.id} viewerId={viewerId} />
    </ProfileHeader>
  );
}

async function TripsView({ userId, viewerId }: { userId: string; viewerId: string }) {
  // Resolved on the server from the request's own zone, not in the card: a
  // `new Date()` inside a component runs once on the server and again on the
  // client, which is how "Upcoming" and "Now" end up disagreeing across a
  // hydration near midnight.
  const [trips, timezone] = await Promise.all([
    getTripsForUser(await getDb(), userId, viewerId),
    getRequestTimezone(),
  ]);
  return (
    <TripList
      trips={trips}
      userId={userId}
      today={goalToday(timezone)}
      canEdit={viewerId === userId}
    />
  );
}
