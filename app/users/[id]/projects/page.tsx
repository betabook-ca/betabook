import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { ProjectsView } from "@/app/users/[id]/projects-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";

type UserProjectsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserProjectsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), (user) => `${user.name} · Projects`);
}

export default async function UserProjectsPage({ params }: UserProjectsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <ProjectsView ownerId={user.id} />
    </ProfileHeader>
  );
}
