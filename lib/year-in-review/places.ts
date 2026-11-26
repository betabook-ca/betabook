import type { YearAreaMap, YearPlace } from "./types";

/** How many names a breadcrumb keeps, ending with the place itself. */
const TRAIL_LENGTH = 3;

/** The deepest area every path shares, or null when the paths share no root.
 * Paths are root-first and end with the area itself, so a single path's
 * common ancestor is its own area. */
export function commonAncestor(paths: readonly (readonly number[])[]): number | null {
  if (paths.length === 0) return null;
  let prefix = paths[0].length;
  for (const path of paths.slice(1)) {
    let shared = 0;
    while (shared < prefix && shared < path.length && path[shared] === paths[0][shared]) {
      shared += 1;
    }
    prefix = shared;
    if (prefix === 0) return null;
  }
  return prefix === 0 ? null : paths[0][prefix - 1];
}

export function placeOf(areas: YearAreaMap, id: number | null): YearPlace | null {
  if (id == null) return null;
  const area = areas.get(id);
  if (!area) return null;
  const trail = area.path
    .slice(-TRAIL_LENGTH)
    .map((ancestor) => areas.get(ancestor)?.name ?? "")
    .filter(Boolean);
  return { id, name: area.name, trail };
}

/** The location of a set of climbs' areas: their common ancestor, or the
 * distinct root names when they share none. */
export function locate(
  areas: YearAreaMap,
  areaIds: Iterable<number>,
): { place: YearPlace | null; roots: string[] } {
  const paths = [...new Set(areaIds)].flatMap((id) => {
    const area = areas.get(id);
    return area ? [area.path] : [];
  });
  const ancestor = commonAncestor(paths);
  if (ancestor != null || paths.length === 0) return { place: placeOf(areas, ancestor), roots: [] };
  // Distinct roots can share a name, so names are deduplicated too.
  const roots = [
    ...new Set(
      [...new Set(paths.map((path) => path[0]))].map((root) => areas.get(root)?.name ?? ""),
    ),
  ]
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b));
  return { place: null, roots };
}

/** Whether one area is the other or contains it. */
export function relatedPlaces(areas: YearAreaMap, a: number, b: number): boolean {
  const pathA = areas.get(a)?.path ?? [];
  const pathB = areas.get(b)?.path ?? [];
  return pathA.includes(b) || pathB.includes(a);
}

/** Share of the current area's days a child needs before the descent steps
 * into it. */
const DESCENT_SHARE = 0.5;
const DESCENT_MIN_DAYS = 3;

export type HomeArea = {
  id: number;
  days: number;
  /** The descent never left the root it started from. */
  atRoot: boolean;
  children: { id: number; days: number }[];
};

/**
 * Where the climber's days concentrate, as specific as the tree and their
 * climbing allow. Each located day counts for its location and every ancestor.
 * The walk starts at the busiest root and steps into the busiest child while
 * that child holds at least half of the current area's days (and 3+ days), so
 * a well-indexed crag and one that keeps every climb in a single area both
 * land on the crag. Ties go to more sends, then name.
 */
export function homeArea(
  areas: YearAreaMap,
  dayLocations: readonly number[],
  sendsByArea: ReadonlyMap<number, number>,
): HomeArea | null {
  const days = new Map<number, number>();
  const children = new Map<number, Set<number>>();
  for (const location of dayLocations) {
    const path = areas.get(location)?.path ?? [];
    for (const [index, id] of path.entries()) {
      days.set(id, (days.get(id) ?? 0) + 1);
      if (index > 0) {
        const siblings = children.get(path[index - 1]) ?? new Set<number>();
        siblings.add(id);
        children.set(path[index - 1], siblings);
      }
    }
  }
  const roots = [...days.keys()].filter((id) => (areas.get(id)?.path.length ?? 0) === 1);
  const better = (a: number, b: number) =>
    (days.get(b) ?? 0) - (days.get(a) ?? 0) ||
    (sendsByArea.get(b) ?? 0) - (sendsByArea.get(a) ?? 0) ||
    (areas.get(a)?.name ?? "").localeCompare(areas.get(b)?.name ?? "");
  let current = roots.toSorted(better)[0];
  if (current == null) return null;
  const root = current;
  for (;;) {
    const options = [...(children.get(current) ?? [])].toSorted(better);
    const next = options[0];
    const total = days.get(current) ?? 0;
    const count = next == null ? 0 : (days.get(next) ?? 0);
    if (next == null || count < DESCENT_MIN_DAYS || count < total * DESCENT_SHARE) break;
    current = next;
  }
  return {
    id: current,
    days: days.get(current) ?? 0,
    atRoot: current === root,
    children: [...(children.get(current) ?? [])]
      .toSorted(better)
      .map((id) => ({ id, days: days.get(id) ?? 0 })),
  };
}
