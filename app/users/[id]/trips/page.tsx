import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripList } from "@/components/trips/trip-list";
import { getDb } from "@/db/client";
import { getTripsForOwner } from "@/db/queries";
import { goalToday } from "@/lib/goals";

type UserTripsPageProps = {
  params: Promise<{ id: string }>;
};

/** Owner-only, like Projects: no audience opens this page to anyone else, so
 * a stranger gets the same 404 as a climber who does not exist. */
export async function generateMetadata({ params }: UserTripsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), (user) => `${user.name} · Trips`);
}

export default async function UserTripsPage({ params }: UserTripsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  const db = await getDb();
  const trips = await getTripsForOwner(db, user.id);

  // Resolved on the server from the request's own zone, not in the card: a
  // `new Date()` inside a component runs once on the server and again on the
  // client, which is how "Upcoming" and "Now" end up disagreeing across a
  // hydration near midnight.
  const { cf } = await getCloudflareContext({ async: true });
  const today = goalToday(cf?.timezone ?? "UTC");

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripList trips={trips} userId={user.id} today={today} />
    </ProfileHeader>
  );
}
