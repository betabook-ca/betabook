import { ActionError } from "@/lib/action-result";
import {
  DEFAULT_GRADE_PREFERENCES,
  type BoulderScale,
  type GradePreferences,
  type RopeScale,
} from "@/lib/grades";

/** The two boulder systems, in the order the account toggle reads them:
 * off is the catalog's native Hueco, on is Fontainebleau. */
export const BOULDER_GRADE_SCALES = [
  { value: "hueco", label: "Hueco (V-scale)" },
  { value: "font", label: "Fontainebleau" },
] as const satisfies readonly { value: BoulderScale; label: string }[];

/** The two route systems: off is the catalog's native YDS, on is French. */
export const ROPE_GRADE_SCALES = [
  { value: "yds", label: "YDS" },
  { value: "french", label: "French" },
] as const satisfies readonly { value: RopeScale; label: string }[];

export const INVALID_GRADE_SCALE_MESSAGE = "Invalid grading system";

export function parseBoulderGradeScale(value: unknown): BoulderScale {
  return parseScale(BOULDER_GRADE_SCALES, value);
}

export function parseRopeGradeScale(value: unknown): RopeScale {
  return parseScale(ROPE_GRADE_SCALES, value);
}

function parseScale<T extends string>(options: readonly { value: T }[], value: unknown): T {
  const option = options.find((candidate) => candidate.value === value);
  if (!option) throw new ActionError(INVALID_GRADE_SCALE_MESSAGE);
  return option.value;
}

/** The stored columns as read from `user` or from `session.user` (where
 * `user.additionalFields` in lib/auth.ts surfaces them). Lenient on purpose:
 * a signed-out reader, a session shape without the fields, or an unexpected
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
