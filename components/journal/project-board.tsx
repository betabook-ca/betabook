"use client";

import { useOverlayState } from "@heroui/react";
import { useMemo, useState } from "react";

import { JournalEntryDrawer } from "@/components/journal/journal-entry-drawer";
import { ProjectCard, type ProjectWithSessions } from "@/components/journal/project-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { OptionSelect } from "@/components/ui/option-select";
import { QueryInput } from "@/components/ui/query-input";
import { useMounted } from "@/hooks/use-mounted";

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

/** Search includes only the preloaded notes, not older paginated sessions. */
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

  return (
    <div className="flex flex-col gap-4">
      {projects.length === 0 ? (
        <EmptyState message="No open projects. Log a session on a climb you haven't sent and it starts one." />
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <QueryInput
              value={query}
              onChange={setQuery}
              label="Filter projects"
              placeholder="Search…"
            />
            <OptionSelect
              ariaLabel="Sort projects"
              value={sort}
              onChange={setSort}
              options={SORTS}
              className={FIELD_WIDTH_CLASS.medium}
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState message="No open projects match this search." />
          ) : (
            <ul aria-label="Open projects" className="flex flex-col gap-3">
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

          {hasMore && (
            <p className="text-sm text-muted">Showing the most recently active projects.</p>
          )}
        </>
      )}
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
