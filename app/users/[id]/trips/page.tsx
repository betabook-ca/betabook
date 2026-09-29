import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ProfileHeader,
  memberMetadata,
  resolveProfilePage,
  resolveSharedProfile,
} from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SharedTrips } from "@/components/trips/shared-trips";
import { TripList } from "@/components/trips/trip-list";
import { getDb } from "@/db/client";
import { getTripsForUser } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";
import { sharedProfileMetadata } from "@/lib/seo";
import type { UrlParamsRecord } from "@/lib/url-params";

type UserTripsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({
  params,
  searchParams,
}: UserTripsPageProps): Promise<Metadata> {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) {
    const shared = await resolveSharedProfile(id, search);
    if (shared) return sharedProfileMetadata(shared.name);
  }
  return memberMetadata(resolved, (user) => `${user.name} · Trips`);
}

export default async function UserTripsPage({ params, searchParams }: UserTripsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "viewer");

  // Resolved on the server from the request's own zone, not in the card: a
  // `new Date()` inside a component runs once on the server and again on the
  // client, which is how "Upcoming" and "Now" end up disagreeing across a
  // hydration near midnight.
  const today = async () => goalToday(await getRequestTimezone());

  if (!resolved.signedIn) {
    const shared = await resolveSharedProfile(id, search);
    if (!shared) return <CurrentPageAuthCallout />;
    const trips = await getTripsForUser(await getDb(), shared.id, null);
    return <SharedTrips owner={shared} trips={trips} today={await today()} />;
  }
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  const trips = await getTripsForUser(await getDb(), user.id, viewerId);

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripList
        trips={trips}
        userId={user.id}
        today={await today()}
        canEdit={viewerId === user.id}
      />
    </ProfileHeader>
  );
}
