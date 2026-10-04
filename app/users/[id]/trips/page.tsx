import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ProfileHeader,
  SharedProfileHeader,
  memberMetadata,
  resolveProfilePage,
  resolveSharedProfile,
} from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { TripList } from "@/components/trips/trip-list";
import { getDb } from "@/db/client";
import { getTripsForUser } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { withProfileShare } from "@/lib/profile-share";
import { getRequestTimezone } from "@/lib/request-timezone";
import { sharedProfileMetadata } from "@/lib/seo";
import { tripsHref } from "@/lib/trips";
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

  if (!resolved.signedIn) {
    const shared = await resolveSharedProfile(id, search);
    if (!shared) return <CurrentPageAuthCallout />;
    return (
      <SharedProfileHeader
        owner={shared}
        next={withProfileShare(tripsHref(shared.id), shared.token)}
      >
        <TripsView userId={shared.id} viewerId={null} shareToken={shared.token} />
      </SharedProfileHeader>
    );
  }
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="logbook">
      <TripsView userId={user.id} viewerId={viewerId} />
    </ProfileHeader>
  );
}

async function TripsView({
  userId,
  viewerId,
  shareToken,
}: {
  userId: string;
  viewerId: string | null;
  shareToken?: string;
}) {
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
      shareToken={shareToken}
    />
  );
}
