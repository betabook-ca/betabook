import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { FriendshipButton } from "@/components/friendship-button";
import { ProfileHeading } from "@/components/profile-heading";
import { ProfileLayout } from "@/components/profile-layout";
import { ProfileTabs } from "@/components/profile-tabs";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getDb } from "@/db/client";
import { getUserProfile, getFriendship, canReadJournal, getShareLinkOwner } from "@/db/queries";
import { getClimberHardest } from "@/db/queries/climber-overview";
import { getMemberSession } from "@/lib/session";
import { canViewUser } from "@/lib/user-visibility";

const getUserById = cache(async (id: string) => getUserProfile(await getDb(), id));

export const canReadUserJournal = cache(async (id: string, viewerId: string) =>
  canReadJournal(await getDb(), id, viewerId),
);

export const getShareLinkOwnerByToken = cache(async (token: string) =>
  getShareLinkOwner(await getDb(), token),
);

export type ProfileUser = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

type MemberSession = NonNullable<Awaited<ReturnType<typeof getMemberSession>>>;

/** Who a profile page admits: its owner alone (Projects, Trips, Goals),
 * anyone canViewUser allows (Sends, Analytics, the profile itself), or
 * whoever canReadJournal currently allows (Journal). */
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
