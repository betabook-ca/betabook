import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { ProjectsView } from "@/app/users/[id]/projects-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";

type UserSentProjectsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserSentProjectsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(
    await resolveProfilePage(id, "owner"),
    (user) => `${user.name} · Sent projects`,
  );
}

export default async function UserSentProjectsPage({ params }: UserSentProjectsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <ProjectsView ownerId={user.id} variant="sent" />
    </ProfileHeader>
  );
}
