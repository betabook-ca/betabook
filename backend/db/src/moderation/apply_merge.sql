-- All rows use the same guarded decision in the enclosing write batch.
INSERT INTO journal_entries(user_id, climb_id, kind, sent, is_ascent, is_send_comment, entry_date, body)
SELECT s.user_id, ?1->>'dest', 'session', 0, 0, 1, date('now'), s.comment FROM sends s
WHERE s.climb_id=?1->>'id' AND s.date_sent IS NULL AND s.comment IS NOT NULL
  AND EXISTS(SELECT 1 FROM sends t WHERE t.user_id=s.user_id AND t.climb_id=?1->>'dest');

UPDATE sends SET videos=(SELECT s.videos FROM sends s WHERE s.user_id=sends.user_id AND s.climb_id=?1->>'id')
WHERE climb_id=?1->>'dest' AND videos IS NULL AND EXISTS (
  SELECT 1 FROM sends s WHERE s.user_id=sends.user_id AND s.climb_id=?1->>'id' AND s.videos IS NOT NULL);

DELETE FROM sends WHERE climb_id=?1->>'id' AND EXISTS (
  SELECT 1 FROM sends t WHERE t.user_id=sends.user_id AND t.climb_id=?1->>'dest');

UPDATE sends SET climb_id=?1->>'dest' WHERE climb_id=?1->>'id';

UPDATE journal_entries SET climb_id=?1->>'dest' WHERE climb_id=?1->>'id';

INSERT INTO pinned_projects(user_id,climb_id,pinned_at)
SELECT p.user_id, ?1->>'dest', p.pinned_at FROM pinned_projects p
WHERE p.climb_id=?1->>'id' AND NOT EXISTS (
 SELECT 1 FROM pinned_projects t WHERE t.user_id=p.user_id AND t.climb_id=?1->>'dest');

UPDATE project_share_links SET climb_id=?1->>'dest' WHERE climb_id=?1->>'id' AND NOT EXISTS (
 SELECT 1 FROM project_share_links t WHERE t.user_id=project_share_links.user_id AND t.climb_id=?1->>'dest');

UPDATE climb_list_items SET climb_id=?1->>'dest' WHERE climb_id=?1->>'id' AND NOT EXISTS (
 SELECT 1 FROM climb_list_items t WHERE t.list_id=climb_list_items.list_id AND t.climb_id=?1->>'dest');

UPDATE climbs SET name=coalesce(?1->>'$.payload.overrides.name',name),grade=coalesce(?1->>'$.payload.overrides.grade',grade),
 description=CASE WHEN json_type(?1,'$.payload.overrides.description') IS NULL THEN description ELSE ?1->>'$.payload.overrides.description' END
 WHERE id=?1->>'dest' AND json_type(?1,'$.payload.overrides')='object';

UPDATE catalog_route_sources SET climb_id=?1->>'dest' WHERE climb_id=?1->>'id';

DELETE FROM climbs WHERE id=?1->>'id';
