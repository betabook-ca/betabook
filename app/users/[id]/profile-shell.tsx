import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { LogEntryButton } from "@/components/journal";
import { ProfileFriendsLink } from "@/components/profile-friends-link";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileTabs } from "@/components/profile-tabs";
import { ShareProfileButton } from "@/components/share-profile-button";
import { getDb } from "@/db/client";
import { getUser, getFriendship, canReadJournal, getShareLinkOwner } from "@/db/queries";
import { getClimberOverview } from "@/db/queries/climber-overview";
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

/** Renders two grid items for PROFILE_LAYOUT_CLASS; the page's section view is the third. */
export async function ProfileHeader({ user, viewerId }: { user: ProfileUser; viewerId: string }) {
  const db = await getDb();
  const isOwner = viewerId === user.id;
  const { cf } = await getCloudflareContext({ async: true });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: cf?.timezone ?? "UTC" }).format(
    new Date(),
  );
  const [relationship, journalVisible, shareUrl, overview] = await Promise.all([
    isOwner ? null : getFriendship(db, viewerId, user.id),
    canReadUserJournal(user.id, viewerId),
    isOwner ? getOwnProfileShareUrl(db, user) : null,
    getClimberOverview(db, user.id, viewerId, today),
  ]);

  return (
    <>
      <aside aria-label="Climber summary" className="xl:sticky xl:top-6 xl:row-span-2">
        <ProfileHeading
          name={user.name}
          image={user.image}
          overview={overview}
          analyticsHref={`/users/${user.id}/analytics`}
          actions={
            isOwner ? (
              <>
                <LogEntryButton />
                {shareUrl && <ShareProfileButton name={user.name} url={shareUrl} />}
              </>
            ) : (
              <FriendshipButton
                userId={user.id}
                name={user.name}
                initialStatus={relationship ?? "none"}
                appearance="profile"
              />
            )
          }
        >
          {isOwner ? (
            <ProfileFriendsLink userId={user.id} />
          ) : (
            !journalVisible && (
              <p className="text-sm text-muted">{`${user.name}'s journal isn't shared with you.`}</p>
            )
          )}
        </ProfileHeading>
      </aside>
      <ProfileTabs userId={user.id} showJournal={journalVisible} showProjects={isOwner} />
    </>
  );
}
