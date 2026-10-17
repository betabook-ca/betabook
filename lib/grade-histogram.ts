import type { GradeHistogramRow, SuggestedGradeCount } from "@/db/queries";
import {
  DEFAULT_GRADE_PREFERENCES,
  gradeArray,
  nativeGradeArray,
  type ClimbType,
  type GradePreferences,
} from "@/lib/grades";
import type { GradeFeel } from "@/lib/sends";

/** One histogram bar. Boulder buckets are one V grade each; rope buckets
 * collapse sub-grades to the number ("5.10a–d" → "5.10"; French "6a/6a+" →
 * "6a"). `range` is the inclusive grade-index span the bucket covers, so a
 * bar click can apply the exact matching grade filter. */
export type GradeBucket = { label: string; count: number; range: [number, number] };

/** One discipline's chart: buckets contiguous from its lowest to highest
 * graded climb (zeros between kept, so the shape is real). */
export type DisciplineHistogram = {
  type: ClimbType;
  buckets: GradeBucket[];
};

export type GradeHistogram = {
  totalClimbs: number;
  /** Climbs with no grade — footnoted rather than given a bar. */
  ungradedCount: number;
  /** Disciplines present, in boulder → sport → trad order. */
  disciplines: ClimbType[];
  /** One chart per discipline present with at least one graded climb, in
   * boulder → sport → trad order. */
  groups: DisciplineHistogram[];
  /** Label span of graded climbs in the chosen scale, e.g. ["V0", "V8"] /
   * ["5.6", "5.12a"] — rope span covers sport and trad together for the
   * info strip. */
  boulderSpan: [string, string] | null;
  ropeSpan: [string, string] | null;
};

export type LoggedGradeRow = {
  label: string;
  total: number;
  isPosted: boolean;
  /** Votes by how the grade felt — a "5.12a but soft" vote is a different
   * opinion from a plain "5.12a", rendered as shaded segments of one bar. */
  feelCounts: Record<GradeFeel, number>;
};

/** Rows a single climb's suggested-grade votes for the logged-grades chart:
 * one row per grade label actually voted — letter grades kept, since for
 * one climb the a/b/c/d debate is the whole point — in grade order, with
 * the votes split by feel inside the row. The posted grade is always
 * represented so the consensus is read against it, even with zero votes.
 * Ordinals that share a label in the chosen scale (French 2 covers 5.1 and
 * 5.2) fold into one row. */
export function buildLoggedGradeRows(
  type: ClimbType,
  counts: SuggestedGradeCount[],
  postedGrade: number | null,
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): LoggedGradeRow[] {
  const bounds = nativeGradeArray(type).length;
  const scale = gradeArray(type, prefs);
  const voted = counts
    .filter((row) => row.grade >= 0 && row.grade < bounds)
    .sort((a, b) => a.grade - b.grade);
  if (voted.length === 0) return [];

  const byLabel = new Map<string, LoggedGradeRow>();
  for (const vote of voted) {
    const label = scale[vote.grade];
    const row = byLabel.get(label) ?? {
      label,
      total: 0,
      isPosted: false,
      feelCounts: { low: 0, solid: 0, high: 0 },
    };
    row.total += vote.count;
    row.feelCounts[vote.feel] += vote.count;
    row.isPosted ||= vote.grade === postedGrade;
    byLabel.set(label, row);
  }
  const rows = [...byLabel.values()];

  const postedRepresented =
    postedGrade == null ||
    postedGrade < 0 ||
    postedGrade >= bounds ||
    rows.some((row) => row.isPosted);
  if (!postedRepresented) {
    rows.push({
      label: scale[postedGrade],
      total: 0,
      isPosted: true,
      feelCounts: { low: 0, solid: 0, high: 0 },
    });
  }
  return rows;
}

/** YDS "5.10a" → "5.10"; French "6a+" → "6a"; grades without a sub-step
 * pass through. */
function collapseRopeLabel(label: string, prefs: GradePreferences): string {
  return prefs.rope === "yds" ? label.replace(/[a-d]$/, "") : label.replace(/\+$/, "");
}

/** The full grade-index span a collapsed rope label covers ("5.10" →
 * [5.10a, 5.10d]) — a bucket click filters the whole label, not just the
 * sub-grades this particular area happens to hold. */
function ropeLabelSpan(label: string, prefs: GradePreferences): [number, number] {
  let first = -1;
  let last = -1;
  for (const [i, grade] of gradeArray("sport", prefs).entries()) {
    if (collapseRopeLabel(grade, prefs) === label) {
      if (first === -1) first = i;
      last = i;
    }
  }
  return [first, last];
}

/** Contiguous buckets for one discipline's counts-by-grade-index map:
 * boulder gets one bucket per V grade; rope disciplines collapse sub-grades
 * to the number, merging in grade order. */
function bucketize(
  type: ClimbType,
  counts: Map<number, number>,
  prefs: GradePreferences,
): GradeBucket[] {
  const indices = [...counts.keys()];
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  const scale = gradeArray(type, prefs);
  const buckets: GradeBucket[] = [];
  for (let i = min; i <= max; i += 1) {
    const raw = scale[i];
    const label = type === "boulder" ? raw : collapseRopeLabel(raw, prefs);
    const count = counts.get(i) ?? 0;
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) {
      last.count += count;
    } else {
      buckets.push({
        label,
        count,
        range: type === "boulder" ? [i, i] : ropeLabelSpan(label, prefs),
      });
    }
  }
  return buckets;
}

/** Buckets the raw (type, grade, count) rows from getSubtreeGradeHistogram
 * into one chart per discipline plus the info-strip aggregates, labelled in
 * the reader's chosen scales. Pure — see grade-histogram.test.ts. */
export function buildGradeHistogram(
  rows: GradeHistogramRow[],
  prefs: GradePreferences = DEFAULT_GRADE_PREFERENCES,
): GradeHistogram {
  let totalClimbs = 0;
  let ungradedCount = 0;
  const present = new Set<ClimbType>();
  const countsByType = new Map<ClimbType, Map<number, number>>();

  for (const row of rows) {
    totalClimbs += row.count;
    present.add(row.type);
    if (row.grade == null) {
      ungradedCount += row.count;
      continue;
    }
    if (row.grade < 0 || row.grade >= nativeGradeArray(row.type).length) continue;
    const counts = countsByType.get(row.type) ?? new Map<number, number>();
    counts.set(row.grade, (counts.get(row.grade) ?? 0) + row.count);
    countsByType.set(row.type, counts);
  }

  const groups: DisciplineHistogram[] = [];
  for (const type of ["boulder", "sport", "trad"] as const) {
    const counts = countsByType.get(type);
    if (counts && counts.size > 0) {
      groups.push({ type, buckets: bucketize(type, counts, prefs) });
    }
  }

  const boulderScale = gradeArray("boulder", prefs);
  const boulderIndices = [...(countsByType.get("boulder")?.keys() ?? [])];
  const boulderSpan: [string, string] | null =
    boulderIndices.length > 0
      ? [boulderScale[Math.min(...boulderIndices)], boulderScale[Math.max(...boulderIndices)]]
      : null;

  const ropeScale = gradeArray("sport", prefs);
  const ropeIndices = [
    ...(countsByType.get("sport")?.keys() ?? []),
    ...(countsByType.get("trad")?.keys() ?? []),
  ];
  const ropeSpan: [string, string] | null =
    ropeIndices.length > 0
      ? [ropeScale[Math.min(...ropeIndices)], ropeScale[Math.max(...ropeIndices)]]
      : null;

  const disciplines = (["boulder", "sport", "trad"] as const).filter((d) => present.has(d));

  return { totalClimbs, ungradedCount, disciplines, groups, boulderSpan, ropeSpan };
}
