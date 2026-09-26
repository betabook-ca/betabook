import { getCloudflareContext } from "@opennextjs/cloudflare";
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
  const db = await getDb();
  const [{ cf }, overview, nextGrades, availableTags] = await Promise.all([
    getCloudflareContext({ async: true }),
    getGoalOverview(db, user.id, user.id),
    getNextGoalGrades(db, user.id, user.id),
    getUserHashtags(db, user.id, user.id, false, true),
  ]);
  await scheduleGoalRefresh(db, user.id);
  const timezone = cf?.timezone ?? "UTC";
  return (
    <ProfileHeader user={user} viewerId={viewerId} workspace="progress">
      <GoalPanel
        key={user.id}
        ownerId={user.id}
        initialActive={overview.active}
        initialCompleted={overview.completed}
        timezone={timezone}
        today={goalToday(timezone)}
        nextGrades={nextGrades}
        availableTags={availableTags}
      />
    </ProfileHeader>
  );
}
