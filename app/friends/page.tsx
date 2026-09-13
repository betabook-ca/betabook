import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { AuthCallout } from "@/components/auth-callout";
import { FriendList } from "@/components/friend-list";
import { FriendSuggestions } from "@/components/friend-suggestions";
import { FriendTabs } from "@/components/friend-tabs";
import { AppLink } from "@/components/ui/app-link";
import { SectionHeading } from "@/components/ui/typography";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { getDb } from "@/db/client";
import { getClimberSuggestions, getFriendsPage } from "@/db/queries";
import { getMemberSession as getSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";

export const metadata: Metadata = { title: "Friends", robots: { index: false } };

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<UrlParamsRecord>;
}) {
  const requestsOnly = (await searchParams).view === "requests";
  const session = await getSession();
  if (!session) return <AuthCallout next={requestsOnly ? "/friends?view=requests" : "/friends"} />;
  const db = await getDb();
  const [page, owner, suggestions] = await Promise.all([
    getFriendsPage(db, session.user.id, requestsOnly),
    getUserById(session.user.id),
    requestsOnly ? null : getClimberSuggestions(db, session.user.id).catch(() => null),
  ]);
  if (!owner) notFound();
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <div className="flex flex-col gap-6">
        <ProfileHeader user={owner} viewerId={session.user.id} />
        <section aria-label="Friends" className="flex w-full min-w-0 flex-col gap-5">
          <SectionHeading>Friends</SectionHeading>
          <p className="text-sm text-muted">
            Accept a request to add someone as a friend. You can remove a friend at any time. Only
            you can see this list, but your friends may be suggested to one another.
          </p>
          <div className="flex flex-wrap gap-4">
            <AppLink href="/?mode=climber">Find climbers</AppLink>
            <AppLink href="/account">Account settings</AppLink>
          </div>
          <FriendTabs requestsOnly={requestsOnly} userId={session.user.id} />
          <FriendList
            key={`${session.user.id}:${requestsOnly}`}
            initialPage={page}
            requestsOnly={requestsOnly}
          />
        </section>
        {suggestions && <FriendSuggestions climbers={suggestions} />}
      </div>
    </ViewerBoundary>
  );
}
