import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import { getMemberSession as getSession } from "@/lib/session";
import type { UrlParamsRecord } from "@/lib/url-params";
import { canViewUser } from "@/lib/user-visibility";

type UserSendsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserSendsPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || !canViewUser(user, session.user.id)) notFound();

  return { title: `${user.name} · Sends`, robots: { index: false } };
}

export default async function UserSendsPage({ params, searchParams }: UserSendsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const session = await getSession();
  if (!session) return <CurrentPageAuthCallout />;
  const user = await getUserById(id);
  const viewerId = session.user.id;

  if (!user || !canViewUser(user, viewerId)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader user={user} viewerId={viewerId} />
      <SendsView
        userId={id}
        viewerId={viewerId}
        filter={parseUserSendsFilter(search)}
        basePath={`/users/${id}/sends`}
      />
    </div>
  );
}
