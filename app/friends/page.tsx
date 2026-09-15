import type { Metadata } from "next";

import { AuthCallout } from "@/components/auth-callout";
import { FriendsContent } from "@/components/friends-content";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { WorkspaceShell } from "@/components/workspace-shell";
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
  const requestedView = (await searchParams).view;
  const view = requestedView === "requests" ? "requests" : "friends";
  const requestsOnly = view === "requests";
  const session = await getSession();
  if (!session)
    return <AuthCallout next={view === "friends" ? "/friends" : `/friends?view=${view}`} />;
  const db = await getDb();
  const [page, suggestions] = await Promise.all([
    getFriendsPage(db, session.user.id, requestsOnly),
    requestsOnly ? null : getClimberSuggestions(db, session.user.id).catch(() => null),
  ]);
  return (
    <ViewerBoundary viewerId={session.user.id}>
      <WorkspaceShell area="community" userId={session.user.id}>
        <FriendsContent
          embedded
          userId={session.user.id}
          view={view}
          page={page}
          suggestions={suggestions}
        />
      </WorkspaceShell>
    </ViewerBoundary>
  );
}
