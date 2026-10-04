import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { scheduleGoalRefresh } from "@/actions/goal-refresh";
import { ProfileHeader, memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { GoalPanel } from "@/components/goals/goal-panel";
import { getDb } from "@/db/client";
import { getGoalOverview, getNextGoalGrades } from "@/db/queries/goals";
import { getUserHashtags } from "@/db/queries/hashtag-filter";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";

type GoalsPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: GoalsPageProps): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), (user) => `${user.name} · Goals`);
}

export default async function GoalsPage({ params }: GoalsPageProps) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const { user, viewerId } = resolved;
  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <GoalsView ownerId={user.id} />
    </ProfileHeader>
  );
}

async function GoalsView({ ownerId }: { ownerId: string }) {
  const db = await getDb();
  const [timezone, overview, nextGrades, availableTags] = await Promise.all([
    getRequestTimezone(),
    getGoalOverview(db, ownerId, ownerId),
    getNextGoalGrades(db, ownerId, ownerId),
    getUserHashtags(db, ownerId, ownerId, false, true),
  ]);
  await scheduleGoalRefresh(db, ownerId);
  return (
    <GoalPanel
      key={ownerId}
      ownerId={ownerId}
      initialActive={overview.active}
      initialCompleted={overview.completed}
      timezone={timezone}
      today={goalToday(timezone)}
      nextGrades={nextGrades}
      availableTags={availableTags}
    />
  );
}
