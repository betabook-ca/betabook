import { Grade, GradeArrow, GradeSuggestion } from "@/components/ui/grade";
import { RatingStars } from "@/components/ui/rating-stars";
import { formatGrade } from "@/lib/grades";
import type { ClimbType } from "@/lib/grades";
import type { GradeFeel } from "@/lib/sends";

type SendGradeCellProps = {
  type: ClimbType;
  /** The grade the row leads with — the climb's posted grade in a feed or
   * logbook row, the climber's own suggested grade on a climb page where
   * the posted grade is already the headline. */
  grade: number | null;
  /** The climber's suggested grade, shown in parentheses when it differs
   * from `grade`. Omit where `grade` already is the suggestion. */
  suggestedGrade?: number | null;
  gradeFeel: GradeFeel;
  rating: number | null;
};

/** The grade line of a send row — grade, the climber's differing suggestion,
 * how it felt, and their stars — shared by every list of sends so the three
 * places a send is printed can't drift. */
export function SendGradeCell({
  type,
  grade,
  suggestedGrade,
  gradeFeel,
  rating,
}: SendGradeCellProps) {
  const arrow =
    gradeFeel === "high" ? (
      <GradeArrow direction="up" label="Felt hard for the grade" />
    ) : gradeFeel === "low" ? (
      <GradeArrow direction="down" label="Felt soft for the grade" />
    ) : null;
  const showSuggestion = suggestedGrade != null && suggestedGrade !== grade;

  return (
    <div className="flex items-center gap-2">
      <Grade>
        {formatGrade(type, grade)}
        {showSuggestion ? (
          <GradeSuggestion arrow={arrow}>{formatGrade(type, suggestedGrade)}</GradeSuggestion>
        ) : (
          arrow
        )}
      </Grade>
      <span aria-hidden className="text-sm text-muted">
        ·
      </span>
      <RatingStars rating={rating} />
    </div>
  );
}
