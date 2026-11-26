import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { expiredLinkCard } from "@/components/expired-link-card";
import { ProjectBoard } from "@/components/journal/project-board";
import type { ProjectWithSessions } from "@/components/journal/project-card";
import { ProjectTabs } from "@/components/journal/project-tabs";
import { SharedProject } from "@/components/shared-project";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { WorkspaceShell } from "@/components/workspace-shell";
import type {
  OpenProject,
  SharedProject as ProjectDetails,
  SharedProjectSession,
} from "@/db/queries";
import { projectSharePath } from "@/lib/project-share";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchJson, isNotFoundError } from "@/spa/lib/fetch-json";
import { useRouterRefreshKey } from "@/spa/lib/use-refresh-key";

type Board = {
  projects: ProjectWithSessions[];
  hasMore: boolean;
  pinnedClimbIds: number[];
  suggestions: OpenProject[];
};
type Shared =
  | { status: "hidden" | "expired" }
  | {
      status: "visible";
      project: ProjectDetails;
      sessions: SharedProjectSession[];
    };

function useProjectData<T>(url: string, initial: T | null = null) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const refresh = useRouterRefreshKey();
  useEffect(() => {
    if (initial && refresh === 0) return;
    const controller = new AbortController();
    async function load() {
      try {
        const value = await fetchJson<T>(url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setError(null);
        setData(value);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(isNotFoundError(cause) ? "Project not found" : "Could not load projects.");
      }
    }
    void load();
    return () => controller.abort();
  }, [initial, refresh, url]);
  return { data, error };
}

function OwnerBoard({ userId, sent }: { userId: string; sent: boolean }) {
  const { data, error } = useProjectData<Board>(
    `/api/pages/users/${encodeURIComponent(userId)}/projects?sent=${sent}`,
  );
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <SkeletonListRows rows={4} />;
  const variant = sent ? "sent" : "open";
  return (
    <WorkspaceShell area="progress" userId={userId}>
      <div className="flex min-w-0 flex-col gap-4">
        <SectionHeading className="sr-only">
          {sent ? "Sent projects" : "Open projects"}
        </SectionHeading>
        <ProjectTabs view={variant} userId={userId} />
        <ProjectBoard
          userId={userId}
          variant={variant}
          shareOrigin={window.location.origin}
          {...data}
        />
      </div>
    </WorkspaceShell>
  );
}

function PublicProject({ token, signedIn }: { token: string; signedIn: boolean }) {
  const path = projectSharePath(encodeURIComponent(token));
  const [initial] = useState(() => peekBootstrapData("shared-project", path) as Shared | null);
  const { data, error } = useProjectData<Shared>(`/api/pages${path}`, initial);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <SkeletonListRows rows={4} />;
  if (data.status === "expired") return expiredLinkCard("projects");
  if (data.status !== "visible") return <PageTitle>Project not found</PageTitle>;
  return (
    <SharedProject
      project={data.project}
      sessions={data.sessions}
      signedIn={signedIn}
      path={path}
    />
  );
}

export default function ProjectsRoute({
  viewerId,
  sent = false,
}: {
  viewerId: string | null;
  sent?: boolean;
}) {
  const { id, token } = useParams();
  if (token) return <PublicProject key={token} token={token} signedIn={Boolean(viewerId)} />;
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (id !== viewerId) return <PageTitle>Climber not found</PageTitle>;
  return <OwnerBoard key={`${id}:${sent}`} userId={id} sent={sent} />;
}
