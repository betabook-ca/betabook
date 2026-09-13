import { sql, type SQL } from "drizzle-orm";

import {
  DEFAULT_BOULDER_RANGE,
  DEFAULT_SPORT_RANGE,
  DEFAULT_TRAD_RANGE,
  type DisciplineGradeFilter,
} from "@/lib/filters/discipline-filter";
import type { Discipline } from "@/lib/grades";

export const PAGE_SIZE = 50;

/**
 * Turns raw user input into an FTS5 prefix query: each word becomes a quoted
 * prefix term (implicitly AND'd together), so "squam" matches "Squamish" and
 * quoting neutralizes FTS5 query-syntax characters (`-`, `:`, `"`, etc.) in
 * the input instead of them causing a syntax error or being interpreted as
 * MATCH operators.
 */
export function toFtsPrefixQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .map((word) => word.replace(/"/g, '""').trim())
    .filter(Boolean)
    .map((word) => `"${word}"*`)
    .join(" ");
}

/** A full range includes ungraded climbs; a narrowed range excludes them. */
export function disciplineGradeCondition(
  type: Discipline,
  range: [number, number],
  fullRange: [number, number],
): SQL {
  const [min, max] = range;
  if (min <= fullRange[0] && max >= fullRange[1]) return sql`climbs.type = ${type}`;
  return sql`(climbs.type = ${type} AND climbs.grade BETWEEN ${min} AND ${max})`;
}

/** One OR-able clause per checked discipline. */
export function disciplineGradeConditions(filter: DisciplineGradeFilter): SQL[] {
  const clauses: SQL[] = [];
  if (filter.disciplines.includes("boulder") && filter.boulderRange) {
    clauses.push(disciplineGradeCondition("boulder", filter.boulderRange, DEFAULT_BOULDER_RANGE));
  }
  if (filter.disciplines.includes("sport") && filter.sportRange) {
    clauses.push(disciplineGradeCondition("sport", filter.sportRange, DEFAULT_SPORT_RANGE));
  }
  if (filter.disciplines.includes("trad") && filter.tradRange) {
    clauses.push(disciplineGradeCondition("trad", filter.tradRange, DEFAULT_TRAD_RANGE));
  }
  return clauses;
}
