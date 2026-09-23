import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripList } from "@/components/trips/trip-list";
import { getDb } from "@/db/client";
import { getTripsForOwner } from "@/db/queries";
import { getMemberSession } from "@/lib/session";

type UserTripsPageProps = {
  params: Promise<{ id: string }>;
};

/** Owner-only, like Projects: the comparison is against the session's own id
 * rather than a visibility helper, because there is no audience that opens
 * this page to anyone else. A stranger gets the same 404 as a climber who does
 * not exist. */
export async function generateMetadata({ params }: UserTripsPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  return { title: `${user.name} · Trips`, robots: { index: false } };
}

export default async function UserTripsPage({ params }: UserTripsPageProps) {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return <CurrentPageAuthCallout />;
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  const db = await getDb();
  const trips = await getTripsForOwner(db, user.id);

  // Resolved on the server from the request's own zone, not in the card: a
  // `new Date()` inside a component runs once on the server and again on the
  // client, which is how "Upcoming" and "Now" end up disagreeing across a
  // hydration near midnight.
  const { cf } = await getCloudflareContext({ async: true });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: cf?.timezone ?? "UTC" }).format(
    new Date(),
  );

  return (
    <ProfileHeader user={user} viewerId={session.user.id} workspace="logbook">
      <TripList trips={trips} userId={user.id} today={today} />
    </ProfileHeader>
  );
}
