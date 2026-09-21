import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { ProjectsView } from "@/app/users/[id]/projects-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getMemberSession } from "@/lib/session";

type UserProjectsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserProjectsPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  return { title: `${user.name} · Projects`, robots: { index: false } };
}

export default async function UserProjectsPage({ params }: UserProjectsPageProps) {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return <CurrentPageAuthCallout />;
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  return (
    <ProfileHeader user={user} viewerId={session.user.id} workspace="progress">
      <ProjectsView ownerId={user.id} />
    </ProfileHeader>
  );
}
