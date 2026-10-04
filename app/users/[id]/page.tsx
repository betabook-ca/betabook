import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import {
  ProfileHeader,
  SharedProfileHeader,
  canReadUserJournal,
  memberMetadata,
  resolveProfilePage,
  resolveSharedProfile,
} from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { SharedProfile } from "@/components/shared-profile";
import { getDb } from "@/db/client";
import { getAreaBreadcrumbs, getSendsForUserPage, getUserSendsSummary } from "@/db/queries";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER, parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { SHARED_PROFILE_SENDS, profileSharePath } from "@/lib/profile-share";
import { sharedProfileMetadata } from "@/lib/seo";
import type { UrlParamsRecord } from "@/lib/url-params";

type UserPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params, searchParams }: UserPageProps): Promise<Metadata> {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) {
    const shared = await resolveSharedProfile(id, search);
    if (shared) return sharedProfileMetadata(shared.name);
  }
  return memberMetadata(resolved, (user) => user.name);
}

export default async function UserPage({ params, searchParams }: UserPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) {
    const shared = await resolveSharedProfile(id, search);
    if (!shared) return <CurrentPageAuthCallout />;
    const next = profileSharePath(shared.id, shared.token);
    return (
      <SharedProfileHeader owner={shared} next={next}>
        <SharedProfileView owner={shared} next={next} />
      </SharedProfileHeader>
    );
  }
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  const journalIsVisible = await canReadUserJournal(user.id, viewerId);

  return (
    <ProfileHeader user={user} viewerId={viewerId}>
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
    </ProfileHeader>
  );
}

async function SharedProfileView({
  owner,
  next,
}: {
  owner: { id: string; name: string };
  next: string;
}) {
  const db = await getDb();
  // A null viewer keeps Members and Friends commentary out of the preview.
  const [summary, recent] = await Promise.all([
    getUserSendsSummary(db, owner.id),
    getSendsForUserPage(db, owner.id, DEFAULT_USER_SENDS_FILTER, 0, SHARED_PROFILE_SENDS, null),
  ]);
  const areaBreadcrumbs = await getAreaBreadcrumbs(
    db,
    recent.sends.map((send) => send.areaId),
  );
  return (
    <SharedProfile
      owner={owner}
      sendCount={summary.sendCount}
      sends={recent.sends}
      areaBreadcrumbs={areaBreadcrumbs}
      next={next}
    />
  );
}
