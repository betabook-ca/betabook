"use client";

import { GradeArrow, GradeSuggestion } from "@/components/ui/grade";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import { describeGradeTrend, type ClimbType } from "@/lib/grades";

/** A climb's posted grade with the community's suggested-grade trend beside
 * it, labelled in the viewer's chosen scale. Client-only for the same reason
 * as GradeLabel: climb rows and stat cards are server-rendered and should
 * not have to carry the preference themselves. */
export function GradeWithTrend({
  type,
  grade,
  avgSuggestedGrade,
}: {
  type: ClimbType;
  grade: number | null;
  avgSuggestedGrade: number | null;
}) {
  const prefs = useGradePreferences();
  const { postedLabel, suggestedLabel, arrow } = describeGradeTrend(
    type,
    grade,
    avgSuggestedGrade,
    prefs,
  );
  // Same arrow as a send row's feel: up is "the community grades it harder
  // than posted", down "softer" — one sign wherever a grade is compared.
  const arrowIcon =
    arrow === "up" ? (
      <GradeArrow direction="up" label="Community grades it harder" />
    ) : arrow === "down" ? (
      <GradeArrow direction="down" label="Community grades it softer" />
    ) : null;

  // One inline-flex line whoever prints it: a stat card's plain span would
  // otherwise let the block-level icon fall below the grade.
  return (
    <span className="inline-flex items-center gap-0.5">
      {postedLabel}
      {suggestedLabel == null ? (
        arrowIcon
      ) : (
        <GradeSuggestion arrow={arrowIcon}>{suggestedLabel}</GradeSuggestion>
      )}
    </span>
  );
}
