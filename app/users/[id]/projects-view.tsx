import { getCloudflareContext } from "@opennextjs/cloudflare";

import { GoalPanel } from "@/components/goals/goal-panel";
import { ProjectBoard } from "@/components/journal";
import type { ProjectWithSessions } from "@/components/journal";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getOpenProjects,
  getOpenProjectSessions,
  OPEN_PROJECT_PAGE_SIZE,
  type JournalEntry,
} from "@/db/queries";
import { getGoalOverview, getNextGoalGrades } from "@/db/queries/goals";
import { goalToday } from "@/lib/goals";

export async function ProjectsView({ ownerId }: { ownerId: string }) {
  const db = await getDb();
  const [{ cf }, rows, overview, nextGrades] = await Promise.all([
    getCloudflareContext({ async: true }),
    getOpenProjects(db, ownerId, ownerId, OPEN_PROJECT_PAGE_SIZE + 1),
    getGoalOverview(db, ownerId, ownerId),
    getNextGoalGrades(db, ownerId, ownerId),
  ]);
  const timezone = cf?.timezone ?? "UTC";
  const hasMore = rows.length > OPEN_PROJECT_PAGE_SIZE;
  const projects = rows.slice(0, OPEN_PROJECT_PAGE_SIZE);

  const sessions = await getOpenProjectSessions(
    db,
    ownerId,
    ownerId,
    projects.map((project) => project.climbId),
  );
  const byClimb = new Map<number, JournalEntry[]>();
  for (const entry of sessions) {
    if (entry.climbId == null) continue;
    const climbSessions = byClimb.get(entry.climbId);
    if (climbSessions) climbSessions.push(entry);
    else byClimb.set(entry.climbId, [entry]);
  }
  const withSessions: ProjectWithSessions[] = projects.map((project) => ({
    ...project,
    sessions: byClimb.get(project.climbId) ?? [],
  }));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">Projects</SectionHeading>
      <ProjectBoard
        userId={ownerId}
        projects={withSessions}
        hasMore={hasMore}
        goals={
          <GoalPanel
            key={ownerId}
            ownerId={ownerId}
            isOwner
            initialActive={overview.active}
            initialCompleted={overview.completed}
            timezone={timezone}
            today={goalToday(timezone)}
            nextGrades={nextGrades}
          />
        }
      />
    </div>
  );
}
