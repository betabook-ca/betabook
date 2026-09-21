import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, getUserById } from "@/app/users/[id]/profile-shell";
import { ProjectsView } from "@/app/users/[id]/projects-view";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getMemberSession } from "@/lib/session";

type UserSentProjectsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserSentProjectsPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return { title: "Member content", robots: { index: false } };
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  return { title: `${user.name} · Sent projects`, robots: { index: false } };
}

export default async function UserSentProjectsPage({ params }: UserSentProjectsPageProps) {
  const { id } = await params;
  const session = await getMemberSession();
  if (!session) return <CurrentPageAuthCallout />;
  const user = await getUserById(id);
  if (!user || session.user.id !== user.id) notFound();

  return (
    <ProfileHeader user={user} viewerId={session.user.id} workspace="progress">
      <ProjectsView ownerId={user.id} variant="sent" />
    </ProfileHeader>
  );
}
