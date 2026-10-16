/**
 * `climbs.grade` is a plain integer ordinal: for boulder climbs it *is* the
 * index into BOULDER_HUECO; for sport/trad climbs it *is* the index into
 * ROPE_YDS. Every stored grade (climbs, suggested grades, goals, goal
 * snapshots) lives in that native ordinal space; Font and French are
 * display-only conversions looked up on the same index.
 *
 * Conversion reference: Guide Dolomiti's comparison chart,
 * https://www.guidedolomiti.com/en/rock-climbing-grades/ (fetched 2026-10).
 * Hueco→Font is 1:1 across the whole range. YDS→French is 1:1 from 5.5
 * (4a) through 5.15d (9c); below that the chart lumps 5.1/5.2 into French 2
 * and 5.3/5.4 into 3, so those French labels repeat. The chart also lists
 * Font steps with no Hueco row (4-, 4+, 6A+, 6B+, 6C+, 7B+) and the Hueco
 * half-steps V0-/V0+, none of which have an ordinal here.
 *
 * Rule for ambiguous converted input: when one converted label covers
 * several ordinals, or a step falls between two ordinals, it resolves to the
 * **larger** ordinal. Pickers therefore offer one option per distinct label
 * (`gradeOptions`), submitting that group's highest ordinal, and
 * `parseGrade` resolves repeated labels to their last index and the in-
 * between Font steps upward through FONT_INPUT_ALIASES. Display never needs
 * the rule: formatting an ordinal is always exact.
 */

export type ClimbType = "boulder" | "sport" | "trad";
export type Discipline = ClimbType;
export type BoulderScale = "hueco" | "font";
export type RopeScale = "yds" | "french";

/** A climber's chosen grading systems, one per discipline family. */
export type GradePreferences = { boulder: BoulderScale; rope: RopeScale };

export const DEFAULT_GRADE_PREFERENCES: GradePreferences = { boulder: "hueco", rope: "yds" };

export const BOULDER_HUECO = [
  "VB",
  "V0",
  "V1",
  "V2",
  "V3",
  "V4",
  "V5",
  "V6",
  "V7",
  "V8",
  "V9",
  "V10",
  "V11",
  "V12",
  "V13",
  "V14",
  "V15",
  "V16",
  "V17",
] as const;

export const HUECO_TO_FONT = [
  "3",
  "4",
  "5",
  "5+",
  "6A",
  "6B",
  "6C",
  "7A",
  "7A+",
  "7B",
  "7C",
  "7C+",
  "8A",
  "8A+",
  "8B",
  "8B+",
  "8C",
  "8C+",
  "9A",
] as const;

export const ROPE_YDS = [
  "5.0",
  "5.1",
  "5.2",
  "5.3",
  "5.4",
  "5.5",
  "5.6",
  "5.7",
  "5.8",
  "5.9",
  "5.10a",
  "5.10b",
  "5.10c",
  "5.10d",
  "5.11a",
  "5.11b",
  "5.11c",
  "5.11d",
  "5.12a",
  "5.12b",
  "5.12c",
  "5.12d",
  "5.13a",
  "5.13b",
  "5.13c",
  "5.13d",
  "5.14a",
  "5.14b",
  "5.14c",
  "5.14d",
  "5.15a",
  "5.15b",
  "5.15c",
  "5.15d",
] as const;

export const YDS_TO_FRENCH = [
  "1",
  "2",
  "2",
  "3",
  "3",
  "4a",
  "4b",
  "4c",
  "5a",
  "5b",
  "5c",
  "6a",
  "6a+",
  "6b",
  "6b+",
  "6c",
  "6c+",
  "7a",
  "7a+",
  "7b",
  "7b+",
  "7c",
  "7c+",
  "8a",
  "8a+",
  "8b",
  "8b+",
  "8c",
  "8c+",
  "9a",
  "9a+",
  "9b",
  "9b+",
  "9c",
] as const;

/** Grade text with no ordinal of its own, resolved upward to the next
 * ordinal per the rule above. Lower-cased keys; input only, never shown. */
const FONT_INPUT_ALIASES: Readonly<Record<string, number>> = {
  "4-": 1,
  "4+": 2,
  "6a+": 5,
  "6b+": 6,
  "6c+": 7,
  "7b+": 10,
};

const HUECO_INPUT_ALIASES: Readonly<Record<string, number>> = {
  "v0-": 1,
  "v0+": 2,
};

function disciplineFor(type: ClimbType): "boulder" | "rope" {
  return type === "boulder" ? "boulder" : "rope";
}

/** Ordinal→text array for a climb type in its native scale (Hueco or YDS).
 * Validation bounds come from here; display goes through `gradeArray`. */
export function nativeGradeArray(type: ClimbType): readonly string[] {
  return disciplineFor(type) === "boulder" ? BOULDER_HUECO : ROPE_YDS;
}

function convertedGradeArray(type: ClimbType): readonly string[] {
  return disciplineFor(type) === "boulder" ? HUECO_TO_FONT : YDS_TO_FRENCH;
}

function usesNativeScale(type: ClimbType, prefs: GradePreferences): boolean {
  return disciplineFor(type) === "boulder" ? prefs.boulder === "hueco" : prefs.rope === "yds";
}

/** Ordinal→text array in the climber's chosen scale for this climb type. */
export function gradeArray(
  type: ClimbType,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): readonly string[] {
  return usesNativeScale(type, prefs) ? nativeGradeArray(type) : convertedGradeArray(type);
}

/** One picker entry: a distinct label and the inclusive ordinal span it
 * covers. Singletons everywhere except the repeated French labels. */
export type GradeLabelGroup = { label: string; min: number; max: number };

const labelGroupCache = new Map<readonly string[], readonly GradeLabelGroup[]>();

/** Distinct labels of a scale in ordinal order with the span each covers. */
export function gradeLabelGroups(
  type: ClimbType,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): readonly GradeLabelGroup[] {
  const table = gradeArray(type, prefs);
  const cached = labelGroupCache.get(table);
  if (cached) return cached;
  const groups: GradeLabelGroup[] = [];
  for (const [i, label] of table.entries()) {
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.max = i;
    else groups.push({ label, min: i, max: i });
  }
  labelGroupCache.set(table, groups);
  return groups;
}

/** Select options for a grade picker: one per distinct label, whose value is
 * the group's highest ordinal as a string — the larger-ordinal rule. */
export function gradeOptions(
  type: ClimbType,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): { value: string; label: string }[] {
  return gradeLabelGroups(type, prefs).map((group) => ({
    value: String(group.max),
    label: group.label,
  }));
}

/** The `gradeOptions` value that shows a stored ordinal as selected. A form
 * keeps the stored ordinal itself until the climber picks something else,
 * so showing 5.1 as French "2" never rewrites it to 5.2 on save. */
export function gradeOptionValue(
  type: ClimbType,
  grade: number,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): string {
  const group = gradeLabelGroups(type, prefs).find((g) => grade >= g.min && grade <= g.max);
  return String(group ? group.max : grade);
}

/**
 * Reverse of formatGrade: grade text -> ordinal index, or null if it doesn't
 * match anything in the chosen table. `preference` mirrors the "native vs
 * converted" choice a caller (e.g. the CSV import wizard) exposes to a user,
 * rather than the raw hueco/font/yds/french distinction — the actual table
 * is resolved from climb type + this preference. A converted label that
 * covers several ordinals resolves to the last (hardest) one, and Font
 * steps without an ordinal resolve upward, per the rule atop this file.
 */
export function parseGrade(
  type: ClimbType,
  text: string,
  preference: "native" | "converted" = "native",
): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const discipline = disciplineFor(type);
  const table = preference === "native" ? nativeGradeArray(type) : convertedGradeArray(type);
  for (let i = table.length - 1; i >= 0; i -= 1) {
    if (table[i].toLowerCase() === trimmed) return i;
  }

  if (discipline !== "boulder") return null;
  const aliases = preference === "native" ? HUECO_INPUT_ALIASES : FONT_INPUT_ALIASES;
  return aliases[trimmed] ?? null;
}

export function formatGrade(
  type: ClimbType,
  grade: number | null | undefined,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): string {
  // "—" is the app-wide fallback for absent row values (grades, ratings,
  // dates) — short enough not to crush row titles on phones.
  if (grade == null) return "—";
  return gradeArray(type, prefs)[grade] ?? "—";
}

export type GradeTrend = {
  postedLabel: string;
  /** Non-null only when the average suggested grade rounds to a whole
   * grade-step away from the posted grade — a divergence worth calling out,
   * as opposed to `arrow`-only "leans past the posted grade but not enough
   * to round to a different step" cases. */
  suggestedLabel: string | null;
  arrow: "up" | "down" | null;
};

/**
 * Posted grade, plus a hint when logged sends' suggested grades diverge from
 * it. The average suggested grade is always compared to *this climb's own*
 * posted grade (never across grading systems) as a step offset: `offset` is
 * the nearest whole grade-step the average centers on, and `remainder` is
 * how far it leans past that — a stand-in for a decimal that wouldn't make
 * sense on a non-numeric scale like "5.10a". Grade feel can contribute a
 * fractional lean even when only one climber has suggested a grade. When the
 * chosen scale prints the offset step with the posted grade's own label
 * (French 2 covers 5.1 and 5.2), the hint would read "2 (2)", so only the
 * arrow survives.
 */
export function describeGradeTrend(
  type: ClimbType,
  grade: number | null,
  avgSuggestedGrade: number | null,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): GradeTrend {
  const postedLabel = formatGrade(type, grade, prefs);
  if (avgSuggestedGrade == null || grade == null) {
    return { postedLabel, suggestedLabel: null, arrow: null };
  }

  const delta = avgSuggestedGrade - grade;
  const offset = Math.round(delta);
  const remainder = delta - offset;
  const arrow = Math.abs(remainder) > 0.25 ? (remainder > 0 ? "up" : "down") : null;

  if (offset === 0) {
    return { postedLabel, suggestedLabel: null, arrow };
  }

  const suggestedLabel = formatGrade(type, grade + offset, prefs);
  if (suggestedLabel === postedLabel) {
    return { postedLabel, suggestedLabel: null, arrow: arrow ?? (offset > 0 ? "up" : "down") };
  }
  return { postedLabel, suggestedLabel, arrow };
}

/** Completed activity uses the climber's grade, falling back to the posted
 * catalog grade. Unsent sessions never inherit either, even after unsending.
 * Returns the ordinal to print (see `GradeLabel`) rather than text, so a
 * server component can hand it to the client to format in the viewer's scale. */
export function activityGrade(
  type: ClimbType | null,
  postedGrade: number | null,
  completed: boolean,
  reportedGrade?: number | null,
): { type: ClimbType; grade: number } | null {
  const grade = reportedGrade ?? postedGrade;
  return completed && type && grade != null ? { type, grade } : null;
}

/** `activityGrade` as text, for callers that already hold the preference. */
export function formatActivityGrade(
  type: ClimbType | null,
  postedGrade: number | null,
  completed: boolean,
  reportedGrade?: number | null,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): string | null {
  const activity = activityGrade(type, postedGrade, completed, reportedGrade);
  return activity ? formatGrade(activity.type, activity.grade, prefs) : null;
}
