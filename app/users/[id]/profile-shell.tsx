import { cache, type ReactNode } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { ShareProfileButton } from "@/components/share-profile-button";
import { getDb } from "@/db/client";
import { getUser, getFriendship, canReadJournal, getShareLinkOwner } from "@/db/queries";
import { getClimberHardest } from "@/db/queries/climber-overview";
import { getOwnProfileShareUrl } from "@/lib/profile-share-url";

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
  isPrivate: boolean;
};

/** The climber's heading and section tabs around one section view. */
export async function ProfileHeader({
  user,
  viewerId,
  children,
}: {
  user: ProfileUser;
  viewerId: string;
  children: ReactNode;
}) {
  const db = await getDb();
  const isOwner = viewerId === user.id;
  const [relationship, journalVisible, shareUrl, hardest] = await Promise.all([
    isOwner ? null : getFriendship(db, viewerId, user.id),
    canReadUserJournal(user.id, viewerId),
    isOwner ? getOwnProfileShareUrl(db, user) : null,
    getClimberHardest(db, user.id),
  ]);

  return (
    <ProfileLayout
      heading={
        <ProfileHeading
          name={user.name}
          image={user.image}
          hardest={hardest}
          nameAction={
            isOwner ? (
              shareUrl && <ShareProfileButton name={user.name} url={shareUrl} />
            ) : (
              <FriendshipButton
                userId={user.id}
                name={user.name}
                initialStatus={relationship ?? "none"}
                appearance="profile"
              />
            )
          }
          note={
            !isOwner &&
            !journalVisible && (
              <p className="text-muted">Their journal isn&apos;t shared with you.</p>
            )
          }
        />
      }
      tabs={<ProfileTabs userId={user.id} showJournal={journalVisible} showProjects={isOwner} />}
    >
      {children}
    </ProfileLayout>
  );
}
