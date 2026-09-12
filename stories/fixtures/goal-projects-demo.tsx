import { GoalCompletionNotice } from "@/components/goals/goal-completion-notice";
import { GoalPanel } from "@/components/goals/goal-panel";
import { ProjectBoard } from "@/components/journal/project-board";

import { goalPanelStoryArgs } from "./goal-samples";
import { openProjects } from "./open-projects";

export function GoalProjectsContext({
  empty = false,
  noProjects = false,
  celebrate = false,
}: {
  empty?: boolean;
  noProjects?: boolean;
  celebrate?: boolean;
}) {
  return (
    <ProjectBoard
      userId={goalPanelStoryArgs.ownerId}
      projects={noProjects ? [] : openProjects}
      hasMore={false}
      goals={
        <div className="flex flex-col gap-4">
          {celebrate && (
            <GoalCompletionNotice
              goals={[goalPanelStoryArgs.initialCompleted.goals[0]]}
              rememberDismissal={false}
              onView={() => {}}
            />
          )}
          <GoalPanel
            {...goalPanelStoryArgs}
            initialActive={empty ? { goals: [], hasMore: false } : goalPanelStoryArgs.initialActive}
            initialCompleted={
              empty ? { goals: [], hasMore: false } : goalPanelStoryArgs.initialCompleted
            }
          />
        </div>
      }
    />
  );
}
