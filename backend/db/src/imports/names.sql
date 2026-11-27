WITH RECURSIVE wanted(key) AS (
  SELECT LOWER(TRIM(value)) FROM json_each(?1)
), ranked AS (
  SELECT climbs.id, climbs.area_id, climbs.name, climbs.type, climbs.grade,
         climbs.send_count, climbs.broken_on, LOWER(TRIM(climbs.name)) AS key,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(climbs.name))
           ORDER BY climbs.send_count DESC, climbs.id
         ) AS rn,
         COUNT(*) OVER (PARTITION BY LOWER(TRIM(climbs.name))) AS total
  FROM climbs
  WHERE LOWER(TRIM(climbs.name)) IN (SELECT key FROM wanted)
), matched AS (
  SELECT * FROM ranked WHERE rn <= 25
), chain(climb_id, ancestor_id, dist) AS (
  SELECT matched.id, areas.parent_id, 1
  FROM matched
  JOIN areas ON areas.id = matched.area_id
  WHERE areas.parent_id IS NOT NULL
  UNION ALL
  SELECT chain.climb_id, areas.parent_id, chain.dist + 1
  FROM chain
  JOIN areas ON areas.id = chain.ancestor_id
  WHERE areas.parent_id IS NOT NULL
)
SELECT matched.id AS id, matched.key AS key, matched.name AS name,
       matched.type AS type, matched.grade AS grade,
       matched.area_id AS areaId, areas.name AS areaName,
       matched.send_count AS sendCount, matched.broken_on AS brokenOn,
       matched.total AS total, (
  -- json_group_array keeps the order it receives rows in, so the ORDER
  -- BY belongs on the subquery it consumes (see searchAreas).
  SELECT json_group_array(json_object('id', a.id, 'name', a.name)) FROM (
    SELECT ancestor.id AS id, ancestor.name AS name
    FROM chain
    JOIN areas ancestor ON ancestor.id = chain.ancestor_id
    WHERE chain.climb_id = matched.id
    ORDER BY chain.dist DESC
  ) a
) AS ancestors
FROM matched
JOIN areas ON areas.id = matched.area_id
ORDER BY matched.key, matched.rn
