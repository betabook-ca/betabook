WITH RECURSIVE wanted(key, area) AS (
  SELECT LOWER(TRIM(json_extract(value, '$.name'))), LOWER(TRIM(json_extract(value, '$.areaName')))
  FROM json_each(?1)
), named AS (
  SELECT climbs.id, climbs.area_id, climbs.name, climbs.type, climbs.grade,
         climbs.send_count, climbs.broken_on, LOWER(TRIM(climbs.name)) AS key,
         COUNT(*) OVER (PARTITION BY LOWER(TRIM(climbs.name))) AS total
  FROM climbs
  WHERE LOWER(TRIM(climbs.name)) IN (SELECT key FROM wanted)
), chain(climb_id, area_id, dist) AS (
  SELECT named.id, named.area_id, 0 FROM named
  UNION ALL
  SELECT chain.climb_id, areas.parent_id, chain.dist + 1
  FROM chain
  JOIN areas ON areas.id = chain.area_id
  WHERE areas.parent_id IS NOT NULL
), matched AS (
  SELECT named.* FROM named
  WHERE EXISTS (
    SELECT 1 FROM chain
    JOIN areas ON areas.id = chain.area_id
    JOIN wanted ON wanted.key = named.key AND wanted.area = LOWER(TRIM(areas.name))
    WHERE chain.climb_id = named.id
  )
)
SELECT matched.id AS id, matched.key AS key, matched.name AS name,
       matched.type AS type, matched.grade AS grade,
       matched.area_id AS areaId, areas.name AS areaName,
       matched.send_count AS sendCount, matched.broken_on AS brokenOn,
       matched.total AS total, (
  SELECT json_group_array(json_object('id', a.id, 'name', a.name)) FROM (
    SELECT ancestor.id AS id, ancestor.name AS name
    FROM chain
    JOIN areas ancestor ON ancestor.id = chain.area_id
    WHERE chain.climb_id = matched.id AND chain.dist > 0
    ORDER BY chain.dist DESC
  ) a
) AS ancestors
FROM matched
JOIN areas ON areas.id = matched.area_id
ORDER BY matched.key, matched.send_count DESC, matched.id
