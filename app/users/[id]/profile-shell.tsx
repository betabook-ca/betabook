import { cache } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { LogEntryButton } from "@/components/journal";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileTabs } from "@/components/profile-tabs";
import { ShareProfileButton } from "@/components/share-profile-button";
import { getDb } from "@/db/client";
import {
  getUser,
  getFriendship,
  canReadJournal,
  getProfileShareToken,
  getShareLinkOwner,
} from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { profileSharePath } from "@/lib/profile-share";

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
  createdAt: Date;
  isPrivate: boolean;
};

export async function ProfileHeader({ user, viewerId }: { user: ProfileUser; viewerId: string }) {
  const isOwner = viewerId === user.id;
  const relationship = await getFriendship(await getDb(), viewerId, user.id);
  const journalVisible = await canReadUserJournal(user.id, viewerId);
  const shareToken =
    isOwner && !user.isPrivate ? await getProfileShareToken(await getDb(), user.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <ProfileHeading
        name={user.name}
        since={new Date(user.createdAt).getFullYear()}
        action={
          isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <LogEntryButton />
              {shareToken && (
                <ShareProfileButton
                  name={user.name}
                  url={new URL(profileSharePath(user.id, shareToken), await getBaseUrl()).href}
                />
              )}
            </div>
          ) : (
            <FriendshipButton userId={user.id} name={user.name} initialStatus={relationship} />
          )
        }
      />
      <ProfileTabs
        userId={user.id}
        showJournal={journalVisible}
        showProjects={isOwner}
        isOwner={isOwner}
      />
    </div>
  );
}
