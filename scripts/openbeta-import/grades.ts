// OpenBeta grade-string -> climbs.grade ordinal mapping. Distinct from
// lib/grades.ts's parseGrade, which only understands an exact literal in
// Betabook's own native scale (YDS/Hueco); this module additionally tries
// the converted scale (French/Font) since OpenBeta rows may carry either.
// lib/grades.ts has no imports of its own, so it's safe to import directly
// from a script that runs outside the app (see lib/name-fold.ts's comment
// for why that matters here).
// Bare Node.js does not resolve the app's @/ alias; share the grade tables directly.
// oxlint-disable import/no-relative-parent-imports
import {
  BOULDER_HUECO,
  ROPE_YDS,
  HUECO_TO_FONT,
  YDS_TO_FRENCH,
  type ClimbType,
} from "../../lib/grades.ts";
// oxlint-enable import/no-relative-parent-imports

type GradeScale = "native" | "converted";

export type GradeMappingResult = { grade: number | null; scale: GradeScale | null };

function indexOfNormalized(table: readonly string[], value: string): number {
  const key = value.trim().toLowerCase();
  return table.findIndex((entry) => entry.toLowerCase() === key);
}

/** Maps one OpenBeta grade string to climbs.grade's ordinal for the given
 * discipline, trying the native scale (Hueco/YDS) first and the converted
 * scale (Font/French) second. Never guesses: an unrecognized string returns
 * { grade: null }, never a nearest-match approximation — climbs.grade is
 * nullable for exactly this reason. */
export function mapGradeToOrdinal(
  type: ClimbType,
  gradeText: string | null | undefined,
): GradeMappingResult {
  if (!gradeText || gradeText.trim() === "") return { grade: null, scale: null };

  const native = type === "boulder" ? BOULDER_HUECO : ROPE_YDS;
  const nativeIndex = indexOfNormalized(native, gradeText);
  if (nativeIndex !== -1) return { grade: nativeIndex, scale: "native" };

  const converted = type === "boulder" ? HUECO_TO_FONT : YDS_TO_FRENCH;
  const convertedIndex = indexOfNormalized(converted, gradeText);
  if (convertedIndex !== -1) return { grade: convertedIndex, scale: "converted" };

  return { grade: null, scale: null };
}
