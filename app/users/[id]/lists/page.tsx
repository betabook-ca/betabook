import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { ClimbListIndex } from "@/components/climb-lists/climb-list-index";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { AppLink } from "@/components/ui/app-link";
import { getDb } from "@/db/client";
import { getClimbListAudience, getClimbListsForUser } from "@/db/queries";
import { SHARING_AUDIENCES } from "@/lib/privacy";

type UserListsPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: UserListsPageProps): Promise<Metadata> {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "lists");
  return memberMetadata(resolved, (user) => `${user.name} · Lists`);
}

/** The climber's lists, for their lists audience. The profile share link
 * doesn't open this tab; each list has its own link. */
export default async function UserListsPage({ params }: UserListsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "lists");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;

  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <ListsView userId={user.id} viewerId={viewerId} />
    </ProfileHeader>
  );
}

async function ListsView({ userId, viewerId }: { userId: string; viewerId: string }) {
  const db = await getDb();
  const owner = userId === viewerId;
  const [lists, audience] = await Promise.all([
    getClimbListsForUser(db, userId, viewerId),
    owner ? getClimbListAudience(db, userId) : null,
  ]);
  const label = SHARING_AUDIENCES.find((option) => option.value === audience)?.label;
  return (
    <ClimbListIndex
      lists={lists}
      userId={userId}
      canEdit={owner}
      note={
        label && (
          <>
            Visible to {label} ·{" "}
            <AppLink href="/account#privacy" className="inline underline">
              Change
            </AppLink>
          </>
        )
      }
    />
  );
}
