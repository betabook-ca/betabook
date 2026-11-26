import { useParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { expiredLinkCard } from "@/components/expired-link-card";
import { ProjectBoard } from "@/components/journal/project-board";
import { ProjectTabs } from "@/components/journal/project-tabs";
import { SharedProject } from "@/components/shared-project";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { WorkspaceShell } from "@/components/workspace-shell";
import { projectSharePath } from "@/lib/project-share";
import { peekBootstrapData } from "@/spa/bootstrap";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { usePageTitle } from "@/spa/lib/document-navigation";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type Shared = ApiResponse<"/api/pages/projects/{token}">;

function OwnerBoard({ userId, sent }: { userId: string; sent: boolean }) {
  const variant = sent ? "sent" : "open";
  const { data, query, error } = useRetainedPage({
    scope: userId,
    query: variant,
    load: (signal) =>
      fetchApi("/api/pages/users/{id}/projects", { path: { id: userId }, query: { sent }, signal }),
  });
  const board = query === variant ? data : undefined;
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
          {...board}
          projects={board?.projects ?? []}
          hasMore={board?.hasMore ?? false}
          loading={!board}
          error={
            error
              ? isNotFoundError(error)
                ? "Project not found"
                : "Could not load projects."
              : undefined
          }
        />
      </div>
    </WorkspaceShell>
  );
}

function PublicProject({ token, signedIn }: { token: string; signedIn: boolean }) {
  const path = projectSharePath(encodeURIComponent(token));
  const { data, error } = useRetainedPage({
    scope: token,
    query: "",
    initial: () => peekBootstrapData("shared-project", path) as Shared | null,
    load: (signal) => fetchApi("/api/pages/projects/{token}", { path: { token }, signal }),
  });
  usePageTitle(
    data?.status === "visible"
      ? data.project.ownerName +
          (data.project.sent ? " sent " : " is projecting ") +
          data.project.climbName
      : "Shared project",
  );
  if (error)
    return (
      <p role="alert">
        {isNotFoundError(error) ? "Project not found" : "Could not load projects."}
      </p>
    );
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
  return <OwnerBoard key={id} userId={id} sent={sent} />;
}
