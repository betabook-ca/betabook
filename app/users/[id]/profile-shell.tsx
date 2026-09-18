import { cache, type ReactNode } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getDb } from "@/db/client";
import { getUser, getFriendship, canReadJournal, getShareLinkOwner } from "@/db/queries";
import { getClimberHardest } from "@/db/queries/climber-overview";
import { shownProfilePhoto } from "@/lib/profile-photo";

export const getUserById = cache(async (id: string) => {
  const db = await getDb();
  return getUser(db, id);
});

export const canReadUserJournal = cache(async (id: string, viewerId: string) =>
  canReadJournal(await getDb(), id, viewerId),
);

export const getShareLinkOwnerByToken = cache(async (token: string) =>
  getShareLinkOwner(await getDb(), token),
);

type ProfileUser = {
  id: string;
  name: string;
  image: string | null;
  showProfilePhoto: boolean;
};

/** Owner workspaces use task tabs; visitors retain the climber's profile heading. */
export async function ProfileHeader({
  user,
  viewerId,
  children,
  workspace = "logbook",
}: {
  user: ProfileUser;
  viewerId: string;
  children: ReactNode;
  workspace?: "logbook" | "progress";
}) {
  if (viewerId === user.id)
    return (
      <WorkspaceShell area={workspace} userId={user.id}>
        {children}
      </WorkspaceShell>
    );
  const db = await getDb();
  const [relationship, journalVisible, hardest] = await Promise.all([
    getFriendship(db, viewerId, user.id),
    canReadUserJournal(user.id, viewerId),
    getClimberHardest(db, user.id),
  ]);

  return (
    <ProfileLayout
      heading={
        <ProfileHeading
          name={user.name}
          image={shownProfilePhoto(user)}
          hardest={hardest}
          nameAction={
            <FriendshipButton
              userId={user.id}
              name={user.name}
              initialStatus={relationship ?? "none"}
              appearance="profile"
            />
          }
          note={
            !journalVisible && (
              <p className="text-muted">Their journal isn&apos;t shared with you.</p>
            )
          }
        />
      }
      tabs={<ProfileTabs userId={user.id} showJournal={journalVisible} />}
    >
      {children}
    </ProfileLayout>
  );
}
