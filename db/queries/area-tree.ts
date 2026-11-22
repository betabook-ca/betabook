import { sql, type SQL } from "drizzle-orm";

/** The one subtree walk: a `subtree(id)` CTE holding `areaId` and every
 * descendant, for a statement to follow with a SELECT that names `subtree`.
 * UNION ALL is safe from a single root, since the cycle guards in migration
 * 0017 keep the hierarchy a tree. The seed is the bare id, so an unknown id
 * yields itself alone, which matches no area and no climb. */
export function subtreeCte(areaId: number): SQL {
  return sql`
    WITH RECURSIVE subtree(id) AS (
      SELECT ${areaId}
      UNION ALL
      SELECT a.id FROM areas a JOIN subtree s ON a.parent_id = s.id
    )`;
}

/** `column` names an area in `areaId`'s subtree, the area itself included. */
export function inAreaSubtreeSql(column: SQL, areaId: number): SQL {
  return sql`${column} IN (${subtreeCte(areaId)} SELECT id FROM subtree)`;
}

/** The one upward walk: area `id` and its ancestors, root first, so the last
 * row is the area itself. An unknown id yields no rows. Proportional to tree
 * depth, never to subtree size. */
export function areaTrailSql(id: number): SQL {
  return sql`
    WITH RECURSIVE chain(id, depth) AS (
      SELECT ${id}, 0
      UNION ALL
      SELECT areas.parent_id, chain.depth + 1
      FROM areas JOIN chain ON chain.id = areas.id
      WHERE areas.parent_id IS NOT NULL
    )
    SELECT areas.id AS id, areas.parent_id AS parentId, areas.name AS name,
           areas.description AS description
    FROM areas JOIN chain ON chain.id = areas.id
    ORDER BY chain.depth DESC
  `;
}

/** The candidate's own row when `trail` (from `areaTrailSql(candidate)`)
 * passes through `areaId`, i.e. the candidate is `areaId` or descends from it. */
export function trailTargetWithin<T extends { id: number }>(
  trail: T[],
  areaId: number,
): T | undefined {
  return trail.some((ancestor) => ancestor.id === areaId) ? trail.at(-1) : undefined;
}

/** Root-first ancestor names joined by " > ", or NULL for a root, for the
 * area `areaId` names, read from an `ancestor_chain(area_id, ancestor_id,
 * dist)` CTE (`ancestorChainCte`) in the same statement. */
export function ancestorPathSql(areaId: SQL): SQL {
  // GROUP_CONCAT joins rows in the order it receives them, so the ORDER BY
  // belongs on a subquery it consumes. Placed beside the aggregate it would
  // order that query's single output row instead, leaving the concatenation
  // to follow incidental scan order.
  return sql`(
    SELECT GROUP_CONCAT(name, ' > ') FROM (
      SELECT ancestor.name AS name
      FROM ancestor_chain
      JOIN areas ancestor ON ancestor.id = ancestor_chain.ancestor_id
      WHERE ancestor_chain.area_id = ${areaId}
      ORDER BY ancestor_chain.dist DESC
    )
  )`;
}

/** `ancestor_chain(area_id, ancestor_id, dist)`: every ancestor of each area
 * id in `targets` (a CTE or table with an `area_id` column), at distance 1 for
 * the parent. For use after `WITH RECURSIVE` and the CTE that defines
 * `targets`. */
export function ancestorChainCte(targets: SQL): SQL {
  return sql`ancestor_chain(area_id, ancestor_id, dist) AS (
      SELECT ${targets}.area_id, areas.parent_id, 1
      FROM ${targets}
      JOIN areas ON areas.id = ${targets}.area_id
      WHERE areas.parent_id IS NOT NULL
      UNION ALL
      SELECT ancestor_chain.area_id, areas.parent_id, ancestor_chain.dist + 1
      FROM ancestor_chain
      JOIN areas ON areas.id = ancestor_chain.ancestor_id
      WHERE areas.parent_id IS NOT NULL
    )`;
}
