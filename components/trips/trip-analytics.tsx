import type { ComponentProps } from "react";

import { TripAnalyticsView } from "@/components/trips/trip-analytics-view";
import { getViewerGradePreferences } from "@/lib/session";

export async function TripAnalytics(
  props: Omit<ComponentProps<typeof TripAnalyticsView>, "gradePreferences">,
) {
  return <TripAnalyticsView {...props} gradePreferences={await getViewerGradePreferences()} />;
}
