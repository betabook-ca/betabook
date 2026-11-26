"use client";

import { useGradePreferences } from "@/components/ui/grade-preferences";
import { formatGrade, type ClimbType } from "@/lib/grades";

/** A grade ordinal printed in the viewer's chosen scale. The one client
 * boundary grades need: a server component passes the ordinal and this
 * formats it with the preference the template provided, so pages never
 * thread the preference through props just to print a grade. */
export function GradeLabel({ type, grade }: { type: ClimbType; grade: number | null | undefined }) {
  const prefs = useGradePreferences();
  return <>{formatGrade(type, grade, prefs)}</>;
}
