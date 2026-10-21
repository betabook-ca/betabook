import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import type { UrlParamsRecord } from "@/lib/url-params";

type UserJournalPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserJournalPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(
    await resolveProfilePage(id, "journal"),
    (user) => `${user.name} · Journal`,
  );
}

export default async function UserJournalPage({ params, searchParams }: UserJournalPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "journal");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId}>
      <JournalView ownerId={user.id} viewerId={viewerId} filter={parseJournalFilter(search)} />
    </ProfileHeader>
  );
}
