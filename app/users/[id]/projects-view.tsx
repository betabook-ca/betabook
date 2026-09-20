import { ProjectBoard } from "@/components/journal";
import type { ProjectWithSessions } from "@/components/journal";
import { ProjectTabs } from "@/components/journal/project-tabs";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import {
  getOpenProjectSuggestions,
  getPinnedProjects,
  getPinnedProjectSessions,
  OPEN_PROJECT_PAGE_SIZE,
  type JournalEntry,
} from "@/db/queries";

/** Both Projects tabs render from here: `variant` only chooses which side of
 * the pin/send split to list, so the two stay consistent by construction. */
export async function ProjectsView({
  ownerId,
  variant = "open",
}: {
  ownerId: string;
  variant?: "open" | "sent";
}) {
  const sent = variant === "sent";
  const db = await getDb();
  const rows = await getPinnedProjects(db, ownerId, ownerId, { sent }, OPEN_PROJECT_PAGE_SIZE + 1);
  const hasMore = rows.length > OPEN_PROJECT_PAGE_SIZE;
  const projects = rows.slice(0, OPEN_PROJECT_PAGE_SIZE);

  const sessions = await getPinnedProjectSessions(
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

  // Suggestions ride along as props rather than through an API route: the list
  // is short, the ownership check is already done here, and refresh() after a
  // pin re-renders this tree with the pinned climb removed from it.
  const suggestions = sent ? [] : await getOpenProjectSuggestions(db, ownerId, ownerId);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionHeading className="sr-only">
        {sent ? "Sent projects" : "Open projects"}
      </SectionHeading>
      <ProjectTabs view={variant} userId={ownerId} />
      <ProjectBoard
        userId={ownerId}
        projects={withSessions}
        hasMore={hasMore}
        variant={variant}
        suggestions={suggestions}
      />
    </div>
  );
}
