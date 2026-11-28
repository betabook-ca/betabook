import { useParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { ProjectBoard } from "@/components/journal/project-board";
import { ProjectTabs } from "@/components/journal/project-tabs";
import { SharedProject } from "@/components/journal/shared-project";
import { ClimberNotFound } from "@/components/profile/climber-not-found";
import { expiredLinkCard } from "@/components/sharing/expired-link-card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { NotFoundMessage } from "@/components/ui/not-found-message";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
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
    resource: "projects:OwnerBoard",
    scope: userId,
    query: variant,
    load: (signal) =>
      fetchApi("/api/pages/users/{id}/projects", { path: { id: userId }, query: { sent }, signal }),
  });
  const board = query === variant ? data : undefined;
  return (
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
  );
}

function ProjectNotFound() {
  return (
    <NotFoundMessage
      heading="Project not found"
      message="No shared project is available at this URL."
    />
  );
}

function PublicProject({ token, signedIn }: { token: string; signedIn: boolean }) {
  const path = projectSharePath(encodeURIComponent(token));
  const { data, error } = useRetainedPage({
    resource: "projects:PublicProject",
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
  if (isNotFoundError(error)) return <ProjectNotFound />;
  if (error) return <InlineAlert>Could not load projects.</InlineAlert>;
  if (!data) return <SkeletonListRows rows={4} />;
  if (data.status === "expired") return expiredLinkCard("projects");
  if (data.status !== "visible") return <ProjectNotFound />;
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
  if (id !== viewerId) return <ClimberNotFound />;
  return <OwnerBoard key={id} userId={id} sent={sent} />;
}
