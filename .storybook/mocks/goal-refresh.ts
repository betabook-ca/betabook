import { fn } from "storybook/test";

import type { scheduleGoalRefresh as ScheduleGoalRefresh } from "@/actions/goal-refresh";

// Story actions never register server-only after-response work.
export const scheduleGoalRefresh = fn<typeof ScheduleGoalRefresh>().mockResolvedValue(undefined);
