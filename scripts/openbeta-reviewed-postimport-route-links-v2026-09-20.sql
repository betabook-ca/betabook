-- Four source routes share an exact name, type, and final crag with original
-- Betabook climbs. Their grades differ by 2-3 ordinals, so the automated
-- post-import link rule held them. Reviewed on 2026-09-20; retain original IDs.
CREATE TABLE openbeta_postimport_route_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO openbeta_postimport_route_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM climbs WHERE
    (id=67884 AND area_id=338 AND name='Anabel' AND type='boulder' AND grade=2) OR
    (id=235892 AND area_id=338 AND name='Anabel' AND type='boulder' AND grade=5 AND description IS NULL AND send_count=0 AND rating_count=0) OR
    (id=29282 AND area_id=338 AND name='Iron Man' AND type='boulder' AND grade=1) OR
    (id=269931 AND area_id=338 AND name='Iron Man' AND type='boulder' AND grade=4 AND description IS NULL AND send_count=0 AND rating_count=0) OR
    (id=43221 AND area_id=546 AND name='Magical Handhold' AND type='sport' AND grade=10) OR
    (id=286601 AND area_id=546 AND name='Magical Handhold' AND type='sport' AND grade=12 AND description IS NULL AND send_count=0 AND rating_count=0) OR
    (id=57330 AND area_id=4131 AND name='Pecker Head' AND type='sport' AND grade=14) OR
    (id=167605 AND area_id=4131 AND name='Pecker Head' AND type='sport' AND grade=12 AND description IS NULL AND send_count=0 AND rating_count=0)
  )=8
  AND (SELECT COUNT(*) FROM catalog_route_sources WHERE source='openbeta' AND status='new' AND (
    (source_id='a1133913-535b-510a-8607-aa2e51d275cc' AND climb_id=235892) OR
    (source_id='da603eb9-cbd7-5f86-a05d-1703e967c365' AND climb_id=269931) OR
    (source_id='f6341208-737f-5488-9986-272c874a7059' AND climb_id=286601) OR
    (source_id='2c88e90e-5620-5da6-9275-f82d63a0847a' AND climb_id=167605)
  ))=4
  AND (SELECT COUNT(*) FROM catalog_route_sources WHERE climb_id IN (235892,269931,286601,167605))=4
  AND NOT EXISTS(SELECT 1 FROM sends WHERE climb_id IN (235892,269931,286601,167605))
  AND NOT EXISTS(SELECT 1 FROM journal_entries WHERE climb_id IN (235892,269931,286601,167605))
  AND NOT EXISTS(SELECT 1 FROM change_requests WHERE entity_id IN (235892,269931,286601,167605)
    AND status='pending' AND type IN ('climb_edit','climb_delete','climb_move','climb_merge','climb_break'))
THEN 1 ELSE 0 END;
DELETE FROM openbeta_postimport_route_guard;

UPDATE catalog_route_sources SET climb_id=67884,status='matched',match_kind='reviewed_same_area_grade_disagreement',match_score=NULL WHERE source='openbeta' AND source_id='a1133913-535b-510a-8607-aa2e51d275cc' AND climb_id=235892 AND status='new';
UPDATE catalog_route_sources SET climb_id=29282,status='matched',match_kind='reviewed_same_area_grade_disagreement',match_score=NULL WHERE source='openbeta' AND source_id='da603eb9-cbd7-5f86-a05d-1703e967c365' AND climb_id=269931 AND status='new';
UPDATE catalog_route_sources SET climb_id=43221,status='matched',match_kind='reviewed_same_area_grade_disagreement',match_score=NULL WHERE source='openbeta' AND source_id='f6341208-737f-5488-9986-272c874a7059' AND climb_id=286601 AND status='new';
UPDATE catalog_route_sources SET climb_id=57330,status='matched',match_kind='reviewed_same_area_grade_disagreement',match_score=NULL WHERE source='openbeta' AND source_id='2c88e90e-5620-5da6-9275-f82d63a0847a' AND climb_id=167605 AND status='new';

INSERT INTO openbeta_postimport_route_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM catalog_route_sources WHERE source='openbeta' AND status='matched' AND match_kind='reviewed_same_area_grade_disagreement' AND (
    (source_id='a1133913-535b-510a-8607-aa2e51d275cc' AND climb_id=67884) OR
    (source_id='da603eb9-cbd7-5f86-a05d-1703e967c365' AND climb_id=29282) OR
    (source_id='f6341208-737f-5488-9986-272c874a7059' AND climb_id=43221) OR
    (source_id='2c88e90e-5620-5da6-9275-f82d63a0847a' AND climb_id=57330)
  ))=4
THEN 1 ELSE 0 END;
DELETE FROM openbeta_postimport_route_guard;
DELETE FROM climbs WHERE id IN (235892,269931,286601,167605);
DROP TABLE openbeta_postimport_route_guard;
