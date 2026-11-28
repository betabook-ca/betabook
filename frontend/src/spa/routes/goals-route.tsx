import { useParams } from "react-router";

import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { GoalPanel } from "@/components/goals/goal-panel";
import { ClimberNotFound } from "@/components/profile/climber-not-found";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";
import { isNotFoundError } from "@/spa/lib/fetch-json";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

type GoalOverview = ApiResponse<"/api/pages/users/{id}/goals">;

function OwnerGoals({ ownerId }: { ownerId: string }) {
  const page = useRetainedPage<GoalOverview>({
    resource: "goals:OwnerGoals",
    scope: ownerId,
    query: "",
    load: (signal) => fetchApi("/api/pages/users/{id}/goals", { path: { id: ownerId }, signal }),
  });
  const { data } = page;
  const error = !page.error
    ? ""
    : isNotFoundError(page.error)
      ? "Climber not found"
      : "Couldn't load goals. Try again.";
  return error ? (
    <InlineAlert>{error}</InlineAlert>
  ) : data ? (
    <GoalPanel ownerId={ownerId} {...data} />
  ) : (
    <SkeletonListRows rows={4} className="max-md:min-h-svh" />
  );
}

export default function GoalsRoute({ viewerId }: { viewerId: string | null }) {
  const { id } = useParams();
  if (!viewerId) return <CurrentPageAuthCallout />;
  if (id !== viewerId) return <ClimberNotFound />;
  return <OwnerGoals key={id} ownerId={id} />;
}
