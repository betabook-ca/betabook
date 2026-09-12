import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JournalView } from "@/app/users/[id]/journal-view";
import { ProfileHeader, getUserById, canReadUserJournal } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { parseJournalFilter } from "@/lib/filters/journal-filter";
import { getMemberSession as getSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";

type UserJournalPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserJournalPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || !(await canReadUserJournal(user.id, session.user.id))) notFound();

  return { title: `${user.name} · Journal`, robots: { index: false } };
}

export default async function UserJournalPage({ params, searchParams }: UserJournalPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) return <CurrentPageAuthCallout />;
  const user = await getUserById(id);
  const viewerId = session.user.id;

  if (!user || !(await canReadUserJournal(user.id, viewerId))) notFound();

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={viewerId} />
      <JournalView ownerId={user.id} viewerId={viewerId} filter={parseJournalFilter(search)} />
    </div>
  );
}
