import {
  DEFAULT_GRADE_PREFERENCES,
  type BoulderScale,
  type GradePreferences,
  type RopeScale,
} from "@/lib/grades";

/** The two boulder systems, catalog-native Hueco first. Short labels: the
 * account control prints each beside an example grade. */
export const BOULDER_GRADE_SCALES = [
  { value: "hueco", label: "Hueco" },
  { value: "font", label: "Font" },
] as const satisfies readonly { value: BoulderScale; label: string }[];

/** The two route systems, catalog-native YDS first. */
export const ROPE_GRADE_SCALES = [
  { value: "yds", label: "YDS" },
  { value: "french", label: "French" },
] as const satisfies readonly { value: RopeScale; label: string }[];

/** The display scales stored on a profile or session.
 * A signed-out reader, a session shape without the fields, or an unexpected
 * value all fall back to the native scales rather than failing a render. */
export function gradePreferencesFor(
  user: { boulderGradeScale?: string | null; ropeGradeScale?: string | null } | null | undefined,
): GradePreferences {
  if (!user) return DEFAULT_GRADE_PREFERENCES;
  const boulder = BOULDER_GRADE_SCALES.find((s) => s.value === user.boulderGradeScale)?.value;
  const rope = ROPE_GRADE_SCALES.find((s) => s.value === user.ropeGradeScale)?.value;
  if (!boulder && !rope) return DEFAULT_GRADE_PREFERENCES;
  return {
    boulder: boulder ?? DEFAULT_GRADE_PREFERENCES.boulder,
    rope: rope ?? DEFAULT_GRADE_PREFERENCES.rope,
  };
}
