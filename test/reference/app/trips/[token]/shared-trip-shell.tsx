import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { tripToday } from "@/app/users/[id]/trips/[tripId]/trip-shell";
import { expiredLinkCard } from "@/components/expired-link-card";
import { signUpCard } from "@/components/sign-up-card";
import { AppLink } from "@/components/ui/app-link";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getDb } from "@/db/client";
import { getSharedTrip, type SharedTrip } from "@/db/queries";
import { requestMemo } from "@/lib/request-memo";
import { sharedTripMetadata } from "@/lib/seo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";

export type SharedTripPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Cached per request so a page and its `generateMetadata` resolve the link
 * with one read. */
const getSharedTripByToken = requestMemo(async (token: string) =>
  getSharedTrip(await getDb(), token),
);

const SHARED_TRIP_FALLBACK_METADATA: Metadata = { title: "Shared trip", robots: { index: false } };

/** A dead or expired link previews as nothing, like the page it unfurls. */
export async function sharedTripPageMetadata({ params }: SharedTripPageProps): Promise<Metadata> {
  const token = parseShareToken((await params).token);
  if (!token) return SHARED_TRIP_FALLBACK_METADATA;
  const { shared } = await getSharedTripByToken(token);
  return shared
    ? sharedTripMetadata(shared.owner.name, shared.trip.name)
    : SHARED_TRIP_FALLBACK_METADATA;
}

type ResolvedSharedTrip = SharedTrip & {
  token: string;
  signedIn: boolean;
  today: string;
};

/**
 * Resolves a trip link for its page, or answers for it: a dead link 404s, an
 * expired one says so, and the owner is sent to their own trip page, which has
 * the Share dialog and everything else this one leaves out. The owner is sent
 * there from an expired link too, where the dialog renews it.
 *
 * A trip link carries no audience, so the session decides only the owner
 * redirect and the sign-up prompt, never what may be read. Holding the token
 * is the permission, and every read on the page re-checks it in SQL.
 */
export async function resolveSharedTripPage(
  props: SharedTripPageProps,
  ownerPath: (ownerId: string, tripId: number) => string,
): Promise<{ expired: ReactNode; shared?: undefined } | { shared: ResolvedSharedTrip }> {
  const token = parseShareToken((await props.params).token);
  if (!token) notFound();
  const [access, session, today] = await Promise.all([
    getSharedTripByToken(token),
    getMemberSession(),
    tripToday(),
  ]);
  if (access.status === "hidden") notFound();
  const [ownerId, tripId] =
    access.status === "expired"
      ? [access.ownerId, access.tripId]
      : [access.shared.owner.id, access.shared.trip.id];
  if (session?.user.id === ownerId) redirect(ownerPath(ownerId, tripId));
  if (access.status === "expired") return { expired: expiredLinkCard("trips") };
  return { shared: { ...access.shared, token, signedIn: session !== null, today } };
}

/** Who shared the trip, above the trip itself, and an invitation below it for
 * a reader without an account. The owner's profile is linked: a live link
 * means the profile is public to members, and a signed-out reader gets the
 * sign-in callout there. */
export function SharedTripLayout({
  owner,
  signedIn,
  path,
  children,
}: {
  owner: SharedTrip["owner"];
  signedIn: boolean;
  /** Where sign-up should return to. */
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={owner.name} image={owner.image} size="lg" />
        <PageTitle className="min-w-0 break-words">
          <AppLink href={`/users/${owner.id}`}>{owner.name}</AppLink>&apos;s trip
        </PageTitle>
      </div>
      {children}
      {!signedIn &&
        signUpCard({
          ownerName: owner.name,
          path,
          pitch: "Log your own trips, with every session and send, day by day.",
        })}
    </div>
  );
}
