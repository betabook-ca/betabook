"use client";

import { useOverlayState } from "@heroui/react";
import { useMemo, useState } from "react";

import { StatTiles } from "@/components/analytics-stat-tiles";
import { JournalEntryDrawer } from "@/components/journal/journal-entry-drawer";
import { ProjectCard, type ProjectWithSessions } from "@/components/journal/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { OptionSelect } from "@/components/ui/option-select";
import { QueryInput } from "@/components/ui/query-input";
import { useMounted } from "@/hooks/use-mounted";
import { formatCount } from "@/lib/format";
import { daysBetween, describeDaysAgo, formatDate } from "@/lib/format-date";

const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "sessions", label: "Most sessions" },
  { value: "longest", label: "Longest running" },
  { value: "name", label: "Name" },
] as const;

type ProjectSort = (typeof SORTS)[number]["value"];

const COMPARATORS: Record<ProjectSort, (a: ProjectWithSessions, b: ProjectWithSessions) => number> =
  {
    recent: (a, b) => b.lastSession.localeCompare(a.lastSession) || a.climbId - b.climbId,
    sessions: (a, b) =>
      b.sessionCount - a.sessionCount || b.lastSession.localeCompare(a.lastSession),
    longest: (a, b) => a.firstSession.localeCompare(b.firstSession) || a.climbId - b.climbId,
    name: (a, b) => a.climbName.localeCompare(b.climbName) || a.climbId - b.climbId,
  };

function haystack(project: ProjectWithSessions): string {
  return [
    project.climbName,
    project.areaName,
    ...project.sessions.flatMap((entry) => [entry.body ?? "", ...entry.tags]),
  ]
    .join("\n")
    .toLowerCase();
}

type ProjectBoardProps = {
  userId: string;
  projects: ProjectWithSessions[];
  /** More open projects exist than the page loaded. */
  hasMore: boolean;
};

/** Filtering and sorting stay client-side: the page holds at most `OPEN_PROJECT_PAGE_SIZE` projects. */
export function ProjectBoard({ userId, projects, hasMore }: ProjectBoardProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [selected, setSelected] = useState<ProjectWithSessions | null>(null);
  const drawer = useOverlayState();
  const mounted = useMounted();
  // Resolved on the client only: the server has no reader timezone, and a
  // date that disagreed across the hydration boundary would be a mismatch.
  const today = mounted ? new Intl.DateTimeFormat("en-CA").format(new Date()) : null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? projects.filter((project) => haystack(project).includes(needle))
      : projects;
    return [...matched].sort(COMPARATORS[sort]);
  }, [projects, query, sort]);

  if (projects.length === 0) {
    return (
      <EmptyState message="No open projects. Log a session on a climb you haven't sent and it starts one." />
    );
  }

  let sessionCount = 0;
  let lastSession = projects[0].lastSession;
  for (const project of projects) {
    sessionCount += project.sessionCount;
    // Civil dates compare as strings.
    if (project.lastSession > lastSession) lastSession = project.lastSession;
  }
  const daysSinceLast = today == null ? null : daysBetween(lastSession, today);

  return (
    <div className="flex flex-col gap-4">
      <StatTiles
        className="grid-cols-2 sm:grid-cols-3"
        tiles={[
          {
            label: "Open projects",
            value: hasMore ? `${projects.length}+` : projects.length,
            sub: `${formatCount(projects.filter((p) => p.noteCount > 0).length, "project")} with notes`,
          },
          { label: "Sessions", value: sessionCount, sub: "Logged on open projects" },
          {
            label: "Last out",
            value: daysSinceLast == null ? "—" : describeDaysAgo(daysSinceLast),
            sub: formatDate(lastSession),
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        {/* The field's max-w-full resolves against this wrapper, so the wrapper
         * is what must be allowed to narrow on a phone. */}
        <div className="min-w-0 flex-1 basis-64">
          <QueryInput
            value={query}
            onChange={setQuery}
            label="Filter projects"
            placeholder="Climb, area, tag or recent note"
          />
        </div>
        <OptionSelect
          ariaLabel="Sort projects"
          value={sort}
          onChange={setSort}
          options={SORTS}
          className="w-44 max-w-full"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState message="No open projects match this search." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((project) => (
            <li key={project.climbId}>
              <ProjectCard
                project={project}
                userId={userId}
                today={today}
                onLogSession={() => {
                  setSelected(project);
                  drawer.open();
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {hasMore && <p className="text-sm text-muted">Showing the most recently active projects.</p>}

      {selected && (
        <JournalEntryDrawer
          climb={{
            id: selected.climbId,
            name: selected.climbName,
            type: selected.climbType,
            grade: selected.climbGrade,
            areaId: selected.areaId,
          }}
          state={drawer}
        />
      )}
    </div>
  );
}
