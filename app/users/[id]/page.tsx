import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import {
  ProfileHeader,
  canReadUserJournal,
  getShareLinkOwnerByToken,
  getUserById,
} from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SharedProfile } from "@/components/shared-profile";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getUserSendsSummary } from "@/db/queries";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER, parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import {
  PROFILE_SHARE_PARAM,
  SHARED_PROFILE_SENDS,
  parseProfileShareToken,
  profileSharePath,
} from "@/lib/profile-share";
import { sharedProfileMetadata } from "@/lib/seo";
import { getMemberSession as getSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";
import { canViewUser } from "@/lib/user-visibility";

type UserPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

async function getSharedProfile(id: string, search: UrlParamsRecord) {
  const token = parseProfileShareToken(search[PROFILE_SHARE_PARAM]);
  if (!token) return null;
  const owner = await getShareLinkOwnerByToken(token);
  return owner?.id === id ? { ...owner, path: profileSharePath(id, token) } : null;
}

export async function generateMetadata({ params, searchParams }: UserPageProps): Promise<Metadata> {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) {
    const shared = await getSharedProfile(id, search);
    return shared
      ? sharedProfileMetadata(shared.name)
      : { title: "Member content", robots: { index: false } };
  }
  const user = await getUserById(id);
  if (!user || !canViewUser(user, session.user.id)) notFound();

  return { title: user.name, robots: { index: false } };
}

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) {
    const shared = await getSharedProfile(id, search);
    if (!shared) return <CurrentPageAuthCallout />;
    const db = await getDb();
    // A null viewer keeps Members and Friends commentary out of the preview.
    const [summary, recent] = await Promise.all([
      getUserSendsSummary(db, shared.id),
      getSendsForUserPage(db, shared.id, DEFAULT_USER_SENDS_FILTER, 0, SHARED_PROFILE_SENDS, null),
    ]);
    const areaBreadcrumbs = await getAreaBreadcrumbs(
      db,
      recent.sends.map((send) => send.areaId),
    );
    return (
      <SharedProfile
        owner={shared}
        summary={summary}
        sends={recent.sends}
        areaBreadcrumbs={areaBreadcrumbs}
        next={shared.path}
      />
    );
  }
  const user = await getUserById(id);
  const viewerId = session.user.id;

  if (!user || !canViewUser(user, viewerId)) notFound();

  const journalIsVisible = await canReadUserJournal(user.id, viewerId);

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={viewerId} />
      {journalIsVisible ? (
        <JournalView ownerId={user.id} viewerId={viewerId} filter={parseJournalFilter(search)} />
      ) : (
        <SendsView
          userId={id}
          viewerId={viewerId}
          filter={parseUserSendsFilter(search)}
          basePath={`/users/${id}`}
        />
      )}
    </div>
  );
}
