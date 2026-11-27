import { GoalCompletionNotice } from "@/components/goals/goal-completion-notice";
import { GoalPanel } from "@/components/goals/goal-panel";

import { goalPanelStoryArgs } from "./goal-samples";

export function GoalPageContext({
  empty = false,
  celebrate = false,
}: {
  empty?: boolean;
  celebrate?: boolean;
}) {
  return (
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
  );
}
