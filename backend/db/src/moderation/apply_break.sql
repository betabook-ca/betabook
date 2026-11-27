UPDATE climbs SET broken_on=?1->>'$.payload.brokenOn', description=?1->>'$.payload.appendedDescription' WHERE id=?1->>'id';

INSERT INTO climbs(area_id,name,type,grade,description)
SELECT area_id,?1->>'$.payload.successorName',type,grade,?1->>'$.payload.successorDescription' FROM climbs WHERE id=?1->>'id';

-- Older or undated sends remain on the original. Later repeats need an undated send on the successor.
INSERT INTO sends(user_id,climb_id,ascent_style,suggested_grade,grade_feel)
SELECT s.user_id, {successor}, s.ascent_style, (SELECT grade FROM climbs WHERE id={successor}), 'solid'
FROM sends s WHERE s.climb_id=?1->>'id' AND (s.date_sent IS NULL OR s.date_sent < ?1->>'$.payload.brokenOn')
 AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.climb_id=s.climb_id AND j.user_id=s.user_id
             AND j.sent=1 AND j.entry_date>=?1->>'$.payload.brokenOn');

UPDATE sends SET climb_id={successor} WHERE climb_id=?1->>'id' AND date_sent>=?1->>'$.payload.brokenOn';

UPDATE journal_entries SET climb_id={successor} WHERE climb_id=?1->>'id' AND entry_date>=?1->>'$.payload.brokenOn';

UPDATE change_requests SET status='rejected',reviewed_at=cast(unixepoch('subsecond')*1000 as integer),
 review_note='This climb has already been marked as broken.'
 WHERE status='pending' AND type='climb_break' AND entity_id=?1->>'id';

UPDATE change_requests SET status='rejected',reviewed_at=cast(unixepoch('subsecond')*1000 as integer),
 review_note='This climb has been marked as broken, and broken climbs can''t be merged.'
 WHERE status='pending' AND type='climb_merge' AND (entity_id=?1->>'id' OR json_extract(payload,'$.targetClimbId')=?1->>'id');
