-- Reviewed route-level geography that the five-token OpenBeta export omits.
-- Source: https://www.mountainproject.com/area/111130491/vesper-peak
-- Source: https://www.mountainproject.com/area/112553799/morning-star-peak
CREATE TABLE openbeta_semantic_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  (SELECT MAX(id) FROM areas)=27322
  AND (SELECT parent_id FROM areas WHERE id=25900 AND name='Glacier Peak Wilderness')=25898
  AND (SELECT parent_id FROM areas WHERE id=7564 AND name='Vesper Peak')=4568
  AND NOT EXISTS(SELECT 1 FROM areas WHERE id=27323 OR (parent_id=25900 AND name='Morning Star Peak'))
  AND EXISTS(SELECT 1 FROM areas WHERE id=4026 AND name='Castle Rock')
  AND EXISTS(SELECT 1 FROM areas WHERE id=4050 AND parent_id=98 AND name='Goat Rock')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE id=27324 OR (parent_id=4026 AND name='Goat Rock'))
  AND EXISTS(SELECT 1 FROM climbs WHERE id=116096 AND area_id=4026 AND name='Bowling Bawl' AND type='boulder' AND grade=2)
  AND EXISTS(SELECT 1 FROM catalog_route_sources WHERE source='openbeta' AND source_id='6b3e3cf3-c01d-5a37-8b1d-718fe61d4fc7' AND climb_id=116096 AND status='matched' AND source_path='United States > California > San Francisco Bay Area > Castle Rock Area > Goat Rock')
  AND EXISTS(SELECT 1 FROM catalog_area_sources WHERE source='openbeta' AND source_path='United States > California > San Francisco Bay Area > Castle Rock Area > Goat Rock' AND area_id=4050 AND quality='route_evidence_area_conflict')
  AND EXISTS(SELECT 1 FROM climbs WHERE id=131857 AND area_id=7564 AND name='The Ragged Edge' AND type='trad' AND grade=7)
  AND EXISTS(SELECT 1 FROM climbs WHERE id=81780 AND area_id=7564 AND name='Mile High Club' AND type='sport' AND grade=10)
  AND EXISTS(SELECT 1 FROM climbs WHERE id=196393 AND area_id=25900 AND name='True Grit' AND type='trad' AND grade=8)
  AND EXISTS(SELECT 1 FROM climbs WHERE id=177859 AND area_id=25900 AND name='Marvin''s Ear' AND type='sport' AND grade=11)
  AND EXISTS(SELECT 1 FROM catalog_route_sources WHERE source='openbeta' AND source_id='d64431f3-5cf1-5385-aac5-764460ad5500' AND status='review' AND climb_id IS NULL AND source_name='Ragged Edge' AND source_grade='5.7' AND source_type='trad' AND source_path='United States > Washington > Northwest Region > Darrington and Mountain Loop Hwy > Glacier Peak Wilderness')
  AND EXISTS(SELECT 1 FROM catalog_route_sources WHERE source='openbeta' AND source_id='0a87ae70-9f1f-54dc-ae34-cf6b16856620' AND status='review' AND climb_id IS NULL AND source_name='Mile High Club' AND source_grade='5.10a' AND source_type='sport' AND source_path='United States > Washington > Northwest Region > Darrington and Mountain Loop Hwy > Glacier Peak Wilderness')
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
INSERT INTO areas (id,parent_id,name,description) VALUES
  (27323,25900,'Morning Star Peak',NULL),
  (27324,4026,'Goat Rock',NULL);
UPDATE areas SET parent_id=25900 WHERE id=7564 AND parent_id=4568;
UPDATE climbs SET area_id=7564 WHERE id=196393 AND area_id=25900;
UPDATE climbs SET area_id=27323 WHERE id=81780 AND area_id=7564;
UPDATE climbs SET area_id=27323 WHERE id=177859 AND area_id=25900;
UPDATE climbs SET area_id=27324 WHERE id=116096 AND area_id=4026;
UPDATE catalog_area_sources SET area_id=27324,quality='reviewed_area_identity'
  WHERE source='openbeta'
    AND source_path='United States > California > San Francisco Bay Area > Castle Rock Area > Goat Rock'
    AND area_id=4050 AND quality='route_evidence_area_conflict';
UPDATE catalog_route_sources SET climb_id=131857,status='matched',
  match_kind='reviewed_source_route',match_score=100
  WHERE source='openbeta' AND source_id='d64431f3-5cf1-5385-aac5-764460ad5500'
  AND status='review' AND climb_id IS NULL;
UPDATE catalog_route_sources SET climb_id=81780,status='matched',
  match_kind='reviewed_source_route',match_score=100
  WHERE source='openbeta' AND source_id='0a87ae70-9f1f-54dc-ae34-cf6b16856620'
  AND status='review' AND climb_id IS NULL;

-- Geographic labels retain their physical sector while shedding modality words.
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  EXISTS(SELECT 1 FROM areas WHERE id=7970 AND parent_id=5764 AND name='Elephant Rock Bouldering')
  AND EXISTS(SELECT 1 FROM areas WHERE id=6873 AND parent_id=4003 AND name='Molino Basin Bouldering')
  AND EXISTS(SELECT 1 FROM areas WHERE id=15576 AND parent_id=4453 AND name='North Rim Routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=15577 AND parent_id=4453 AND name='South Rim Routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=13897 AND parent_id=4120 AND name='West Face Bulge Routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=18038 AND parent_id=18017 AND name='Hot Spot , Rock Climbing')
  AND EXISTS(SELECT 1 FROM areas WHERE id=18216 AND parent_id=18215 AND name='Chimney Pond ("South") Basin - Summer Rock Routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=20790 AND parent_id=20789 AND name='North End routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=23645 AND parent_id=23640 AND name='Upstream Routes')
  AND EXISTS(SELECT 1 FROM areas WHERE id=7068 AND parent_id=4177 AND name='Willow Springs')
  AND EXISTS(SELECT 1 FROM areas WHERE id=7081 AND parent_id=4177 AND name='White Rock Springs')
  AND EXISTS(SELECT 1 FROM areas WHERE id=7637 AND parent_id=26152 AND name='Whipporwill')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=5764 AND name='Elephant Rock')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=4003 AND name='Molino Basin')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=4453 AND name IN ('North Rim','South Rim'))
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=4120 AND name='West Face Bulge')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=18017 AND name='Hot Spot')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=18215 AND name='Chimney Pond (South) Basin')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=20789 AND name='North End')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=23640 AND name='Upstream Area')
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=4177 AND name IN ('Willow Spring','White Rock Spring'))
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id=26152 AND name='Whippoorwill')
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
UPDATE areas SET name='Elephant Rock' WHERE id=7970 AND name='Elephant Rock Bouldering';
UPDATE areas SET name='Molino Basin' WHERE id=6873 AND name='Molino Basin Bouldering';
UPDATE areas SET name='North Rim' WHERE id=15576 AND name='North Rim Routes';
UPDATE areas SET name='South Rim' WHERE id=15577 AND name='South Rim Routes';
UPDATE areas SET name='West Face Bulge' WHERE id=13897 AND name='West Face Bulge Routes';
UPDATE areas SET name='Hot Spot' WHERE id=18038 AND name='Hot Spot , Rock Climbing';
UPDATE areas SET name='Chimney Pond (South) Basin' WHERE id=18216
  AND name='Chimney Pond ("South") Basin - Summer Rock Routes';
UPDATE areas SET name='North End' WHERE id=20790 AND name='North End routes';
UPDATE areas SET name='Upstream Area' WHERE id=23645 AND name='Upstream Routes';
UPDATE areas SET name='Willow Spring' WHERE id=7068 AND name='Willow Springs';
UPDATE areas SET name='White Rock Spring' WHERE id=7081 AND name='White Rock Springs';
UPDATE areas SET name='Whippoorwill' WHERE id=7637 AND name='Whipporwill';

-- Ten Sleep's three legacy Slavery headings contain routes from several crags.
-- Keep the original climb IDs and move each only where route-level source or
-- the first-party guide corroborates its current physical sector.
-- https://www.mountainproject.com/area/107059743/downtown
-- https://tensleepclimbing.com/wp-content/uploads/2020/07/TenSleep_RANTA_FINAL_07102020.pdf
CREATE TABLE openbeta_semantic_route_moves (
  climb_id INTEGER PRIMARY KEY, old_area_id INTEGER NOT NULL,
  new_area_id INTEGER NOT NULL, climb_name TEXT NOT NULL, grade INTEGER NOT NULL
);
INSERT INTO openbeta_semantic_route_moves VALUES
  (59016,7659,9564,'Momma''s Mental Medication',18),
  (78510,7659,9564,'Bisquick Thunderdome',21),
  (14676,9563,9564,'School''s Out',13),
  (27194,9563,9564,'Happiness ',19),
  (130986,9563,9564,'Jackabite',18),
  (11401,10080,9564,'Emancipation',18),
  (91169,7659,9564,'EKV',20),
  (90990,9563,9564,'Emancipated Mommy',17),
  (46558,7659,9564,'The Burden of Immorality',22),
  (19848,9563,26991,'Beer Bong',11),
  (18478,10080,26991,'Douggie and Jimmy''s Excellent Adventure',8),
  (108165,10080,26950,'Robot Steam Roller',19),
  (140261,10080,26949,'Floyd Direct',18);
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM openbeta_semantic_route_moves)=13
  AND (SELECT COUNT(*) FROM openbeta_semantic_route_moves m JOIN climbs c
       ON c.id=m.climb_id AND c.area_id=m.old_area_id
       AND c.name=m.climb_name AND c.type='sport' AND c.grade=m.grade)=13
  AND EXISTS(SELECT 1 FROM areas WHERE id=9564 AND parent_id=7650 AND name='Downpour Wall')
  AND EXISTS(SELECT 1 FROM areas WHERE id=26991 AND parent_id=7650 AND name='Dream Land')
  AND EXISTS(SELECT 1 FROM areas WHERE id=26950 AND parent_id=9561 AND name='Coolsville')
  AND EXISTS(SELECT 1 FROM areas WHERE id=26949 AND parent_id=9561 AND name='Cigar, The')
  AND EXISTS(SELECT 1 FROM areas WHERE id=9561 AND parent_id=4645 AND name='Downtown')
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
UPDATE climbs SET area_id=(SELECT new_area_id FROM openbeta_semantic_route_moves m
                           WHERE m.climb_id=climbs.id)
  WHERE id IN (SELECT climb_id FROM openbeta_semantic_route_moves);

CREATE TABLE openbeta_semantic_source_links (
  source_id TEXT PRIMARY KEY, climb_id INTEGER NOT NULL,
  source_name TEXT NOT NULL, source_grade TEXT NOT NULL,
  target_area_id INTEGER NOT NULL
);
INSERT INTO openbeta_semantic_source_links VALUES
  ('c014ae07-2500-532a-ab93-a9e479714af9',59016,'Mommas Mental Medication','5.12a',9564),
  ('c2a6cca2-90a7-5b67-a791-04e030bc7575',78510,'Bisquick Thunderdome','5.12b/c',9564),
  ('5e31bdc4-f668-53bb-9216-eb15bfc2c252',14676,'School''s Out','5.10+',9564),
  ('4773dee1-f6fa-57a1-b3e2-695c9eac915b',27194,'Happiness','5.12b',9564),
  ('0ef24aeb-51fd-54c1-81f7-1dac60276397',130986,'Jackabite','5.11d',9564),
  ('1edc7391-4e06-5699-aed7-3ff658d53a4a',11401,'Emancipation','5.12a',9564),
  ('861a3644-9994-59af-a455-dd25e15e8b89',19848,'Beer Bong','5.10b',26991),
  ('cf926dc7-3db9-5447-af33-451c9a44cd85',18478,'Douggie and Jimmy''s Excellent Adventure','5.8',26991),
  ('88116390-77d9-5bde-8c9a-74430a5949fb',108165,'Robot Steamroller','5.12a/b',26950),
  ('a1ec32de-8b64-5a43-a633-9ab8a78ca619',140261,'Floyd Direct','5.12a',26949),
  ('e6dce746-b9f2-507a-aeae-adb894af1453',46558,'The Burden of Immortality','5.13a',9564),
  ('61b1ee62-3081-56b5-83d4-429c06b42cc9',91169,'EKV: Exo-atmospheric Kill Vehicle','5.12c',9564),
  ('840ca3ce-e506-5cfb-99d7-abd635727af1',19108,'Broken Promises','5.11a',9564),
  ('47169283-589f-5bda-a015-b4c30258b2c5',76334,'Crown Prince Abdullah','5.12d',9564);
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM openbeta_semantic_source_links)=14
  AND (SELECT COUNT(*) FROM openbeta_semantic_source_links l
       JOIN climbs c ON c.id=l.climb_id AND c.area_id=l.target_area_id
       JOIN catalog_route_sources r ON r.source='openbeta' AND r.source_id=l.source_id
       AND r.source_name=l.source_name AND r.source_grade=l.source_grade
       AND r.source_type='sport' AND r.status='review' AND r.climb_id IS NULL
       AND r.source_path=CASE l.target_area_id
         WHEN 9564 THEN 'United States > Wyoming > Ten Sleep Canyon > Mondo Beyondo > Downpour Wall'
         WHEN 26991 THEN 'United States > Wyoming > Ten Sleep Canyon > Mondo Beyondo > Dream Land'
         WHEN 26950 THEN 'United States > Wyoming > Ten Sleep Canyon > Downtown > Coolsville'
         WHEN 26949 THEN 'United States > Wyoming > Ten Sleep Canyon > Downtown > Cigar, The'
         END)=14
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
UPDATE catalog_route_sources SET
  climb_id=(SELECT climb_id FROM openbeta_semantic_source_links l
            WHERE l.source_id=catalog_route_sources.source_id),
  status='matched',match_kind='reviewed_source_route',match_score=100
  WHERE source='openbeta'
    AND source_id IN (SELECT source_id FROM openbeta_semantic_source_links)
    AND status='review' AND climb_id IS NULL;
DROP TABLE openbeta_semantic_source_links;
DROP TABLE openbeta_semantic_route_moves;

-- Accepted source identities pinpoint twenty originals in narrower BC sectors.
-- The source area crosswalks already name the destination sectors, except
-- Lower Right Stacks whose duplicate area ID is consolidated earlier.
CREATE TABLE openbeta_semantic_placed_routes (
  climb_id INTEGER PRIMARY KEY, old_area_id INTEGER NOT NULL,
  new_area_id INTEGER NOT NULL, climb_name TEXT NOT NULL,
  climb_type TEXT NOT NULL, grade INTEGER NOT NULL,
  source_id TEXT NOT NULL UNIQUE, source_sector TEXT NOT NULL
);
INSERT INTO openbeta_semantic_placed_routes VALUES
  (4863,9784,10090,'Quarter Pint','boulder',6,'8c52b749-d78a-4896-af4d-1ccea6f0b4cd','lower_right'),
  (6261,9784,10090,'Butt Surfer','boulder',5,'fc1d55e2-8f89-403c-9f62-a80f12ffab7a','lower_right'),
  (9271,9784,10090,'Cirrostratus','boulder',4,'fe634199-14bf-4faa-8ca1-d3a9e74abd66','lower_right'),
  (10429,9784,10090,'Funky Seaweed','boulder',8,'59db23fa-991d-4028-8760-42eee57cccd3','lower_right'),
  (15941,9784,10090,'Drive Through French Fries','boulder',6,'af7ad7f4-a127-4c34-a1ad-ee72f11d49bc','lower_right'),
  (76127,9784,10090,'Marco’s Slab','boulder',1,'c3177e0b-4bc8-4ec0-8a07-b9027f09158d','lower_right'),
  (90430,9784,10090,'Caffeine Bomb','boulder',3,'c41a55e9-762e-4d1a-9061-d8e2561fe8e2','lower_right'),
  (107376,9784,10090,'Powder Keg','boulder',10,'7c64246e-bf1d-46ba-b86c-e4303f66416a','lower_right'),
  (124665,9784,10090,'As Easy As It Looks','boulder',2,'effd30c0-84a3-4399-8635-d1e2b5d28322','lower_right'),
  (124687,9784,10090,'Ku''s Arete','boulder',6,'85e3df49-463f-4b10-bce4-659ebb25b206','lower_right'),
  (134301,9784,10090,'Westorium','boulder',10,'bfd9d736-e683-472d-9771-33009ce3d435','lower_right'),
  (140313,9784,10090,'Totally Worth It','boulder',3,'8a67448e-a759-4749-afc6-c3fce88089c2','lower_right'),
  (8349,8217,10852,'Exasperator','trad',12,'bad7e588-48ba-48c2-b88b-e0667e3fa798','grand_base'),
  (10026,8217,10852,'Rutabaga','trad',14,'43dcb689-8819-46d6-a38f-65ed0b4581d9','grand_base'),
  (18365,8217,10852,'Peasant''s Route','trad',12,'0b860144-9901-44ca-83a8-c8ac730590f3','grand_base'),
  (29752,8217,10852,'Knacker Cracker','trad',15,'be1eae36-3258-4d7c-9865-e6bb5e1c49bc','grand_base'),
  (86674,8217,10852,'Apron Strings','trad',11,'b012348e-fec3-4cbb-9689-62094e6483d2','grand_base'),
  (116668,8217,10852,'Arrowroot','trad',11,'64816828-dc38-4886-9589-0641160391f7','grand_base'),
  (86679,6288,6287,'Moon Moves','boulder',2,'93b2662b-0a38-41ac-9b8a-95cc29d230f8','slug'),
  (74529,8207,8206,'Still the Spirits','sport',15,'59316582-7b5e-4f59-bb6f-e16519dc5693','distillery');
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM openbeta_semantic_placed_routes)=20
  AND EXISTS(SELECT 1 FROM areas WHERE id=10090 AND parent_id=9784 AND name='Lower Right')
  AND EXISTS(SELECT 1 FROM areas WHERE id=10852 AND parent_id=5970 AND name='Grand Wall Base Area')
  AND EXISTS(SELECT 1 FROM areas WHERE id=6287 AND parent_id=3627 AND name='Slug Boulders')
  AND EXISTS(SELECT 1 FROM areas WHERE id=8206 AND parent_id=8207 AND name='The Distillery')
  AND (SELECT COUNT(*) FROM openbeta_semantic_placed_routes m
       JOIN climbs c ON c.id=m.climb_id AND c.area_id=m.old_area_id
       AND c.name=m.climb_name AND c.type=m.climb_type AND c.grade=m.grade
       JOIN catalog_route_sources r ON r.source='openbeta' AND r.source_id=m.source_id
       AND r.climb_id=m.climb_id AND r.status='matched'
       AND r.source_path=CASE m.source_sector
         WHEN 'lower_right' THEN 'Canada > British Columbia > Fraser Valley > The Stacks > Lower Right Stacks'
         WHEN 'grand_base' THEN 'Canada > British Columbia > Squamish > Stawamus Chief > Grand Wall Base Area'
         WHEN 'slug' THEN 'Canada > British Columbia > Sea to Sky (North of Whistler) > Pemberton Boulders > Slug Boulder'
         WHEN 'distillery' THEN 'Canada > British Columbia > Sea to Sky (Squamish to Whistler) > Area 44 > The Distillery'
         END)=20
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
UPDATE climbs SET area_id=(SELECT new_area_id FROM openbeta_semantic_placed_routes m
                           WHERE m.climb_id=climbs.id)
  WHERE id IN (SELECT climb_id FROM openbeta_semantic_placed_routes);
DROP TABLE openbeta_semantic_placed_routes;

-- Only the two empty legacy area IDs can be removed. Slavery 9563 keeps the
-- uncorroborated original "The ultimate chipped route" for separate review.
INSERT INTO openbeta_semantic_guard (ok)
SELECT CASE WHEN
  (SELECT name FROM areas WHERE id=7659 AND parent_id=4645)='Slavery'
  AND (SELECT name FROM areas WHERE id=10080 AND parent_id=9561)='Slavery'
  AND NOT EXISTS(SELECT 1 FROM climbs WHERE area_id IN (7659,10080))
  AND NOT EXISTS(SELECT 1 FROM areas WHERE parent_id IN (7659,10080))
  AND NOT EXISTS(SELECT 1 FROM catalog_area_sources WHERE area_id IN (7659,10080))
  AND NOT EXISTS(SELECT 1 FROM admin_area_scopes WHERE area_id IN (7659,10080))
  AND NOT EXISTS(SELECT 1 FROM change_requests WHERE status='pending'
                 AND entity_id IN (7659,10080)
                 AND type IN ('area_edit','area_delete','area_reparent'))
  AND (SELECT description FROM areas WHERE id=7659) IS NULL
  AND (SELECT description FROM areas WHERE id=10080) IS NULL
  THEN 1 ELSE 0 END;
DELETE FROM openbeta_semantic_guard;
DELETE FROM areas WHERE id IN (7659,10080);
DROP TABLE openbeta_semantic_guard;
