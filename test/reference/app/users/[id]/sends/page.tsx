import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { SendsView } from "@/app/users/[id]/sends-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { parseUserSendsFilter } from "@/lib/filters/user-sends-filter";
import type { UrlParamsRecord } from "@/lib/url-params";

type UserSendsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<UrlParamsRecord>;
};

export async function generateMetadata({ params }: UserSendsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "viewer"), (user) => `${user.name} · Sends`);
}

export default async function UserSendsPage({ params, searchParams }: UserSendsPageProps) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const resolved = await resolveProfilePage(id, "viewer");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId}>
      <SendsView
        userId={id}
        viewerId={viewerId}
        filter={parseUserSendsFilter(search)}
        basePath={`/users/${id}/sends`}
      />
    </ProfileHeader>
  );
}
