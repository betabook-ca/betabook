import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileInvite } from "@/components/profile-invite";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getDb } from "@/db/client";
import { getUserProfile, getFriendship, canReadJournal, getShareLinkOwner } from "@/db/queries";
import { getClimberHardest } from "@/db/queries/climber-overview";
import { PROFILE_SHARE_PARAM } from "@/lib/profile-share";
import { requestMemo } from "@/lib/request-memo";
import { getMemberSession } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import type { UrlParamsRecord } from "@/lib/url-params";
import { canViewUser } from "@/lib/user-visibility";

const getUserById = requestMemo(async (id: string) => getUserProfile(await getDb(), id));

export const canReadUserJournal = requestMemo(async (id: string, viewerId: string) =>
  canReadJournal(await getDb(), id, viewerId),
);

const getShareLinkOwnerByToken = requestMemo(async (token: string) =>
  getShareLinkOwner(await getDb(), token),
);

/** Resolves the owner for a share link. Returns null unless the token is current
 * and belongs to this profile. */
export async function resolveSharedProfile(id: string, search: UrlParamsRecord) {
  const token = parseShareToken(search[PROFILE_SHARE_PARAM]);
  if (!token) return null;
  const owner = await getShareLinkOwnerByToken(token);
  return owner?.id === id ? { ...owner, token } : null;
}

export type ProfileUser = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

type MemberSession = NonNullable<Awaited<ReturnType<typeof getMemberSession>>>;

/** Who can open a profile page: only the owner (Projects, Goals), anyone allowed
 * by canViewUser (Sends, Trips, Analytics, the profile itself), or anyone
 * allowed by canReadJournal (Journal). */
type ProfileGate = "owner" | "viewer" | "journal";

type ResolvedProfile =
  | { signedIn: false }
  | { signedIn: true; ok: false }
  | { signedIn: true; ok: true; user: ProfileUser; viewerId: string; session: MemberSession };

/** Every profile page is noindex, and a signed-out reader learns nothing
 * from the title — not even whether the climber exists. */
export const MEMBER_CONTENT_METADATA: Metadata = {
  title: "Member content",
  robots: { index: false },
};

async function admits(gate: ProfileGate, user: ProfileUser, viewerId: string): Promise<boolean> {
  if (gate === "owner") return user.id === viewerId;
  if (gate === "viewer") return canViewUser(user, viewerId);
  return canReadUserJournal(user.id, viewerId);
}

/**
 * The authorization every profile page repeats, in one place.
 *
 * A signed-out reader is reported separately from a refused one, because the
 * page shows them a sign-in callout instead of a 404. Returning `{ ok: false }`
 * rather than calling `notFound()` keeps the decision at the call site, where
 * metadata and the page need different outcomes for the same state.
 */
export async function resolveProfilePage(id: string, gate: ProfileGate): Promise<ResolvedProfile> {
  const session = await getMemberSession();
  if (!session) return { signedIn: false };
  const user = await getUserById(id);
  const viewerId = session.user.id;
  if (!user || !(await admits(gate, user, viewerId))) return { signedIn: true, ok: false };
  return { signedIn: true, ok: true, user, viewerId, session };
}

/** A refused page 404s from metadata too, so a dead link previews as nothing. */
export function memberMetadata(
  resolved: ResolvedProfile,
  title: (user: ProfileUser) => string,
): Metadata {
  if (!resolved.signedIn) return MEMBER_CONTENT_METADATA;
  if (!resolved.ok) notFound();
  return { title: title(resolved.user), robots: { index: false } };
}

/** Profile header for a signed-out visitor with a share link. Same heading and
 * tabs as the signed-in view, with a sign-up invite instead of the friend
 * button, and only the tabs the link can open. */
export async function SharedProfileHeader({
  owner,
  next,
  children,
}: {
  owner: { id: string; name: string; image: string | null; token: string };
  /** Where to return after sign-up or sign-in. */
  next: string;
  children: ReactNode;
}) {
  const hardest = await getClimberHardest(await getDb(), owner.id);
  return (
    <ProfileLayout
      heading={
        <ProfileHeading
          name={owner.name}
          image={owner.image}
          hardest={hardest}
          note={<ProfileInvite name={owner.name} next={next} />}
        />
      }
      tabs={<ProfileTabs userId={owner.id} showJournal={false} share={owner.token} />}
    >
      {children}
    </ProfileLayout>
  );
}

/** Owner workspaces use task tabs; visitors retain the climber's profile heading. */
export async function ProfileHeader({
  user,
  viewerId,
  children,
  workspace = "logbook",
}: {
  user: Pick<ProfileUser, "id" | "name" | "image">;
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
          image={user.image}
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
