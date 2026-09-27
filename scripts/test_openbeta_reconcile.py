"""Focused checks for route identity and source-area alignment."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("openbeta-reconcile.py")
spec = importlib.util.spec_from_file_location("openbeta_reconcile", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class ReconcileTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.catalog = Path(self.directory.name) / "catalog.sql"
        self.catalog.write_text("""
            CREATE TABLE areas (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT, description TEXT);
            CREATE TABLE climbs (id INTEGER PRIMARY KEY, area_id INTEGER, name TEXT, type TEXT, grade INTEGER);
            INSERT INTO areas VALUES
              (1,NULL,'North America',NULL),(2,1,'United States',NULL),
              (3,2,'California',NULL),(4,3,'Tahoe',NULL),
              (5,4,'Sugarloaf',NULL),(6,5,'East Face',NULL),
              (9,3,'Tuolumne Meadows',NULL),(10,9,'Pennyroyal Boulders',NULL),
              (11,10,'The Cave Boulder',NULL),
              (14,3,'New Jack City',NULL),(15,2,'Arkansas',NULL),
              (16,15,'Fern',NULL),(17,2,'Utah',NULL),
              (18,17,'Joe''s Valley',NULL),(19,18,'New Joes',NULL),
              (20,1,'Canada',NULL),(21,20,'Quebec',NULL),
              (22,21,'Val-David',NULL),(23,22,'Mont-King',NULL),
              (24,21,'Laurentides',NULL),(25,20,'Newfoundland',NULL),
              (26,25,'Flatrock',NULL),(27,NULL,'Asia',NULL),
              (28,27,'Laos',NULL),(29,28,'Thakhek (Green Climbers Home)',NULL),
              (30,NULL,'Oceania',NULL),(31,30,'New Zealand',NULL),
              (32,31,'Sheridan Hills',NULL),(33,27,'Thailand',NULL),
              (34,33,'Muay thai',NULL),(35,33,'Railay',NULL),
              (36,35,'Wee''s Present',NULL),(37,NULL,'Europe',NULL),
              (38,37,'Spain',NULL),(39,38,'Siurana',NULL),
              (40,35,'Pranang beach',NULL),
              (41,20,'Nova Scotia',NULL),(42,41,'Digby',NULL),
              (43,42,'Planet of the Apes',NULL),(44,41,'Halifax',NULL),
              (45,44,'Sandy Cove',NULL),
              (46,21,'Silver Lake',NULL),(47,21,'The Troll Market',NULL),
              (48,3,'Jack''s Canyon',NULL),(49,3,'Flagstaff',NULL);
            INSERT INTO climbs VALUES
              (1,6,'Westward','sport',8),
              (2,14,'Love Onsight','sport',12),
              (3,16,'Intergalactic Prophylactic','sport',7),
              (4,32,'Sample Sheridan Route','sport',12),
              (5,34,'Hello Christine','sport',10),
              (6,36,'Hello Christine','sport',10),
              (7,39,'El Prado Del Rey','sport',20),
              (8,29,'Odyssee','sport',10),
              (9,40,'Pranang Princess','sport',10),
              (10,14,'Tom Sawyer','sport',9),
              (11,14,'Same Tier','sport',12),
              (12,48,'Jack and Jill','sport',8),
              (13,48,'Pokey','sport',9),
              (14,49,'Burger King','boulder',3),
              (15,49,'Super Roof','boulder',4),
              (16,49,'Some Crag Route','boulder',5);
        """)
        self.reconciler = module.Reconciler(self.catalog)

    def tearDown(self):
        self.directory.cleanup()

    def test_sit_low_and_plain_are_distinct(self):
        self.assertEqual(module.name_parts("Channel Cat Sit Start"), ("channel cat", "sit"))
        self.assertEqual(module.name_parts("Channel Cat Low"), ("channel cat", "low"))
        self.assertEqual(module.name_parts("Channel Cat"), ("channel cat", "regular"))
        self.assertEqual(module.name_parts("Stolow"), ("stolow", "regular"))
        self.assertEqual(module.name_parts("Chimère départ assis"), ("chimere", "sit"))
        self.assertEqual(module.name_parts("Chimère assis"), ("chimere", "sit"))
        self.assertEqual(module.name_parts("Ruda Tovar (AKA Porter's 12c)"),
                         ("ruda tovar aka porter s 12c", "regular"))

    def test_unnamed_source_placeholders_are_ignored_without_dropping_titles(self):
        for name in ("", "Unknown", "Unknown 5.8 Face", "Unknown Right Arete",
                     "Unknown V3", "Unnamed", "Unnamed Traverse", "No Name Crack",
                     "Untitled #2", "V10", "5.11b", "Unknown/Unnamed #2"):
            with self.subTest(name=name):
                self.assertTrue(module.is_unnamed_climb(name))
        for name in ("Unknown Pleasures", "Unknown Soldier", "Unknown Renown",
                     "Project Mayhem", "No Name Calling"):
            with self.subTest(name=name):
                self.assertFalse(module.is_unnamed_climb(name))

    def test_ungraded_source_uses_the_grade_for_its_climb_type(self):
        row = {"is_boulder": False, "is_sport": True, "is_trad": False,
               "grade_vscale": "V3", "grade_yds": None}
        self.assertTrue(module.is_ungraded_source(row))
        row["grade_yds"] = "5.10"
        self.assertFalse(module.is_ungraded_source(row))
        row["grade_yds"] = "unknown"
        self.assertTrue(module.is_ungraded_source(row))
        row.update(is_boulder=True, is_sport=False, grade_vscale="V?")
        self.assertTrue(module.is_ungraded_source(row))
        row["grade_vscale"] = "V4"
        self.assertFalse(module.is_ungraded_source(row))
        row.update(is_sport=True, grade_yds=None)
        self.assertFalse(module.is_ungraded_source(row))

    def test_reviewed_area_merge_moves_children_and_retains_existing_climb_ids(self):
        with self.catalog.open("a") as stream:
            stream.write("""
                INSERT INTO areas VALUES (50,3,'Tahoe',NULL),(51,50,'Boulder Field',NULL);
                INSERT INTO climbs VALUES (17,50,'Same Route','boulder',4);
            """)
        matcher = module.Reconciler(self.catalog)
        decisions, parent_moves, script = module.plan_reviewed_original_area_merges(matcher, [{
            "duplicate_area_id": "50", "survivor_area_id": "4",
            "duplicate_name": "Tahoe", "survivor_name": "Tahoe",
            "survivor_display_name": "Lake Tahoe", "survivor_new_parent_area_id": "",
            "evidence": "same place", "source_url": "",
        }])
        self.assertEqual(decisions[0]["direct_original_climbs_moved"], 1)
        self.assertEqual(decisions[0]["child_areas_moved"], 1)
        self.assertEqual(parent_moves, [])
        self.assertIn("UPDATE climbs SET area_id=4 WHERE area_id=50", script)
        self.assertIn("UPDATE areas SET parent_id=4 WHERE parent_id=50", script)
        self.assertIn("DELETE FROM areas WHERE id=50", script)
        self.assertIn("UPDATE areas SET name='Lake Tahoe'", script)

    def test_reviewed_area_merge_rejects_colliding_child_areas(self):
        with self.catalog.open("a") as stream:
            stream.write("""
                INSERT INTO areas VALUES (50,3,'Tahoe',NULL),(51,50,'Sugarloaf',NULL);
            """)
        matcher = module.Reconciler(self.catalog)
        with self.assertRaisesRegex(ValueError, "child collisions"):
            module.plan_reviewed_original_area_merges(matcher, [{
                "duplicate_area_id": "50", "survivor_area_id": "4",
                "duplicate_name": "Tahoe", "survivor_name": "Tahoe",
            }])

    def test_reviewed_parent_child_merge_does_not_broaden_admin_scope(self):
        with self.catalog.open("a") as stream:
            stream.write("INSERT INTO areas VALUES (50,4,'Tahoe',NULL);")
        matcher = module.Reconciler(self.catalog)
        _, _, script = module.plan_reviewed_original_area_merges(matcher, [{
            "duplicate_area_id": "50", "survivor_area_id": "4",
            "duplicate_name": "Tahoe", "survivor_name": "Tahoe",
        }])
        self.assertIn("NOT EXISTS(SELECT 1 FROM admin_area_scopes WHERE area_id=50)", script)
        self.assertNotIn("SELECT user_id,4,created_at FROM admin_area_scopes WHERE area_id=50", script)

    def test_reviewed_final_parent_move_checks_current_parent_and_name(self):
        moves = [{"area_id": "48", "area_name": "Jack's Canyon",
                  "expected_old_parent_id": "3", "new_parent_id": "49",
                  "new_parent_name": "Flagstaff", "evidence": "fixture", "source_url": ""}]
        _, applied, script = module.plan_reviewed_original_area_merges(self.reconciler, [], moves)
        self.assertEqual(applied, moves)
        self.assertIn("UPDATE areas SET parent_id=49 WHERE id=48 AND parent_id=3", script)

    def test_reviewed_final_climb_move_guards_identity_and_location(self):
        row = {"climb_id": "12", "climb_name": "Jack and Jill", "climb_type": "sport",
               "grade_ordinal": "8", "expected_area_id": "48", "target_area_id": "49",
               "evidence": "fixture", "source_url": "https://example.test/route"}
        script = module.plan_reviewed_final_climb_moves(self.reconciler, [row])
        self.assertIn("UPDATE climbs SET area_id=49 WHERE id=12 AND area_id=48", script)
        with self.assertRaisesRegex(ValueError, "Invalid final climb move"):
            module.plan_reviewed_final_climb_moves(self.reconciler,
                                                   [{**row, "climb_name": "Different"}])

    def test_reviewed_post_area_link_keeps_original_id_and_start_variant(self):
        row = {"openbeta_id": "source-uuid", "original_climb_id": "12",
               "new_climb_id": "17", "original_name": "Jack and Jill",
               "new_name": "Jack and Jill", "type": "sport",
               "original_grade_ordinal": "8", "new_grade_ordinal": "8",
               "expected_original_area_id": "48", "expected_new_area_id": "48",
               "relationship": "same_area", "source_path": "United States > California > Jack's Canyon"}
        fresh = {"betabook_id": 17, "openbeta_name": "Jack and Jill",
                 "type": "sport", "grade": 8}
        source = ("openbeta", "source-uuid", 17, "Jack and Jill", "5.8", "sport",
                  row["source_path"], 0.0, 0.0, "new", "insert", None, "test")
        script, links = module.plan_reviewed_final_route_links(
            self.reconciler, [row], [fresh], [source])
        self.assertEqual(links, 1)
        self.assertIn("climb_id=12,status='matched'", script)
        self.assertIn("DELETE FROM climbs WHERE id=17", script)
        with self.assertRaisesRegex(ValueError, "Reviewed post-area route identity changed"):
            module.plan_reviewed_final_route_links(
                self.reconciler, [row], [{**fresh, "openbeta_name": "Jack and Jill Sit"}], [source])
        with self.assertRaisesRegex(ValueError, "Reviewed post-area route identity changed"):
            module.plan_reviewed_final_route_links(
                self.reconciler, [{**row, "relationship": "reviewed_cross_branch"}],
                [fresh], [source])
        cross_branch, _ = module.plan_reviewed_final_route_links(
            self.reconciler,
            [{**row, "relationship": "reviewed_cross_branch",
              "expected_new_area_id": "49", "source_url": "https://example.test/route"}],
            [fresh], [source])
        self.assertIn("match_kind='reviewed_cross_branch_route'", cross_branch)
        cross_keep, _ = module.plan_reviewed_final_route_links(
            self.reconciler,
            [{**row, "relationship": "reviewed_cross_branch_keep_original",
              "expected_new_area_id": "49", "source_url": "https://example.test/route"}],
            [fresh], [source])
        self.assertNotIn("UPDATE climbs SET area_id=49 WHERE id=12", cross_keep)
        alias_row = {**row, "relationship": "reviewed_alias_same_area",
                     "new_name": "Jack and Jill (The Original)",
                     "source_url": "https://example.test/route"}
        alias_fresh = {**fresh, "openbeta_name": alias_row["new_name"]}
        alias_script, _ = module.plan_reviewed_final_route_links(
            self.reconciler, [alias_row], [alias_fresh], [source])
        self.assertIn("climb_id=12,status='matched'", alias_script)
        with self.assertRaisesRegex(ValueError, "Reviewed post-area route identity changed"):
            module.plan_reviewed_final_route_links(
                self.reconciler, [{**alias_row, "source_url": ""}], [alias_fresh], [source])

    def test_reviewed_area_alias_folds_source_branch_before_route_matching(self):
        with self.catalog.open("a") as stream:
            stream.write("""
                INSERT INTO areas VALUES (50,2,'Washington',NULL),(51,50,'Vantage',NULL);
                INSERT INTO climbs VALUES (17,51,'Under Duress','sport',8);
            """)
        matcher = module.Reconciler(self.catalog)
        source = {
            "climb_id": "vantage-source", "climb_name": "Under Duress",
            "country": "USA", "state_province": "Washington",
            "region": "Central Region", "area": "Frenchman Coulee, AKA Vantage",
            "crag": "Echo Basin", "grade_vscale": None, "grade_yds": "5.8",
            "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        location = matcher.location(source)
        matcher.resolve_location(location)
        decisions, reparents = module.apply_reviewed_area_aliases(matcher, [source], [{
            "openbeta_prefix": "United States > Washington > Central Region > Frenchman Coulee, AKA Vantage",
            "existing_area_id": "51", "expected_old_parent_id": "50",
            "expected_planned_area_path": "North America > United States > Washington > Central Region > Frenchman Coulee, AKA Vantage",
            "minimum_exact_route_overlaps": "1", "evidence": "test", "source_url": "",
        }])
        mapped, quality = matcher.location_map[location]
        self.assertEqual(reparents[0][0], 51)
        self.assertEqual(quality, "reviewed_area_alias")
        self.assertEqual(matcher.areas[mapped].parent_id, 51)
        self.assertEqual(decisions[0]["corroborating_original_climbs"], 1)
        decision, candidate, _, _ = matcher.decide(source, mapped)
        self.assertEqual((decision, candidate.id if candidate else None), ("match", 17))
        later_location = location[:4] + ("The Feathers",)
        later_area, quality = matcher.resolve_location(later_location)
        self.assertEqual(quality, "reviewed_area_alias")
        self.assertEqual(matcher.areas[later_area].parent_id, 51)

    def test_bouldering_headings_do_not_create_activity_areas(self):
        self.assertEqual(module.source_area_segments(("Ghosttown", "G2"), "Pennsylvania"),
                         ["Ghosttown", "G2"])
        self.assertEqual(module.source_area_segments(
            ("Northern Arizona", "***Northern AZ Bouldering***", "*Flagstaff Bouldering*"),
            "Arizona"), ["Northern Arizona", "Flagstaff"])
        self.assertEqual(module.source_area_segments(
            ("Stone Fort (aka Little Rock City)", "Stone Fort Bouldering", "Bouldering",
             "The Bouldering Wall"), "Tennessee"),
            ["Stone Fort (aka Little Rock City)", "The Bouldering Wall"])
        self.assertEqual(module.source_area_segments(
            ("Ontario South Bouldering and Rock", "Niagara Glen"), "Ontario"),
            ["Ontario South", "Niagara Glen"])
        self.assertEqual(module.source_area_segments(
            ("Belle neige station de ski", "Bouldering Belle neige", "Bouldering Cave"),
            "Quebec"), ["Belle neige station de ski", "Bouldering Cave"])
        self.assertEqual(module.source_area_segments(
            ("Jackson Falls", "Z. Bouldering in the Canyon Proper", "DU Campus Bouldering/Buildering"),
            "Illinois"), ["Jackson Falls", "Canyon Proper", "DU Campus"])
        self.assertEqual(module.source_area_segments(
            ("Smith Rock", "(g) Morning Glory Wall", "(yy) Basalt Rimrock"),
            "Oregon"), ["Smith Rock", "Morning Glory Wall", "Basalt Rimrock"])
        self.assertEqual(module.source_area_segments(
            ("Adirondacks", "H: Southern Mountains", "Nine Corner Lake"),
            "New York"), ["Adirondacks", "Southern Mountains", "Nine Corner Lake"])

    def test_openbeta_text_uses_betabook_entity_decoder(self):
        rows = [{"climb_id": "source-1", "climb_name": "Bill, John, &amp; Lisa",
                 "description": "I&amp;rsquo;ve climbed 5&lt6 times",
                 "area": "Wall &amp; Cave", "grade_vscale": "V3"}]
        self.assertEqual(module.decode_source_text(rows), 3)
        self.assertEqual(rows[0]["climb_name"], "Bill, John, & Lisa")
        self.assertEqual(rows[0]["description"], "I’ve climbed 5&lt6 times")
        self.assertEqual(rows[0]["area"], "Wall & Cave")
        self.assertEqual(rows[0]["climb_id"], "source-1")

    def test_explicit_aka_base_is_review_candidate(self):
        source = {
            "climb_name": "Love Onsight (AKA Onsite)", "country": "USA",
            "state_province": "California", "region": "High Desert",
            "area": "Barstow Area", "crag": "New Jack City", "grade_vscale": None,
            "grade_yds": "5.10c", "is_boulder": False, "is_sport": True,
            "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.aka_base_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 2)

    def test_generic_face_stays_under_its_named_parent(self):
        area, _ = self.reconciler.resolve_location(
            ("United States", "California", "Redwood Coast", "Chezem Cliffs", "East Face")
        )
        self.assertEqual(self.reconciler.path_names(area)[-3:], ("Redwood Coast", "Chezem Cliffs", "East Face"))
        self.assertNotEqual(area, 6)

    def test_generic_cave_does_not_override_table_mountain(self):
        area, _ = self.reconciler.resolve_location(
            ("United States", "California", "Sonora Pass Highway (108)", "Table Mountain", "Cave, The")
        )
        self.assertEqual(self.reconciler.path_names(area)[-3:],
                         ("Sonora Pass Highway (108)", "Table Mountain", "Cave, The"))
        self.assertNotEqual(area, 11)

    def test_same_named_route_in_state_is_flagged_before_insertion(self):
        source = {
            "climb_name": "Westward", "country": "USA", "state_province": "California",
            "grade_vscale": None, "grade_yds": "5.8", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        self.assertEqual(self.reconciler.same_name_region_candidate(source).id, 1)

    def test_short_fuzzy_spelling_in_same_crag_needs_review(self):
        source = {
            "climb_name": "Love Onsite", "country": "USA", "state_province": "California",
            "region": "High Desert", "area": "Barstow Area", "crag": "New Jack City",
            "grade_vscale": None, "grade_yds": "5.10c", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        area, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, climb, _, _ = self.reconciler.decide(source, area)
        self.assertEqual((decision, climb.id if climb else None), ("review", 2))

    def test_source_lists_both_near_names_as_separate_routes(self):
        source = {
            "climb_name": "Love Onsite", "country": "USA", "state_province": "California",
            "region": "High Desert", "area": "Barstow Area", "crag": "New Jack City",
            "grade_vscale": None, "grade_yds": "5.10c", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        location = self.reconciler.location(source)
        self.reconciler.source_names_by_location = {
            location: {("love onsite", "regular"), ("love onsight", "regular")}
        }
        area, _ = self.reconciler.resolve_location(location)
        decision, _, reason, _ = self.reconciler.decide(source, area)
        self.assertEqual((decision, reason), ("review", "source_has_both_names"))

    def test_unmapped_source_grade_keeps_near_name_for_review(self):
        source = {
            "climb_name": "Intergalatic Prophylactic", "country": "USA",
            "state_province": "Arkansas", "region": "Ozark Mountains", "area": "Fern",
            "crag": "Small Wall Boulder", "grade_vscale": None, "grade_yds": "unknown",
            "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        area, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, climb, _, _ = self.reconciler.decide(source, area)
        self.assertEqual((decision, climb.id if climb else None), ("review", 3))

    def test_fuzzy_spelling_under_new_child_is_reviewed(self):
        source = {
            "climb_name": "Intergalatic Prophylactic", "country": "USA",
            "state_province": "Arkansas", "region": "Ozark Mountains", "area": "Fern",
            "crag": "Small Wall Boulder", "grade_vscale": None, "grade_yds": "5.7",
            "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        area, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, climb, _, _ = self.reconciler.decide(source, area)
        self.assertEqual((decision, climb.id if climb else None), ("review", 3))

    def test_name_qualifiers_are_protected(self):
        self.assertTrue(module.protected_name_conflict("lower exum ridge", "upper exum ridge"))
        self.assertTrue(module.protected_name_conflict("biodome 12", "biodome"))
        self.assertTrue(module.protected_name_conflict("the pike", "the spine"))
        self.assertFalse(module.protected_name_conflict("layback flake", "lieback flake"))

    def test_compact_area_alias_reuses_existing_sibling(self):
        area, _ = self.reconciler.resolve_location(
            ("United States", "Utah", "Central Utah", "Joe's Valley", "New Joe's")
        )
        self.assertEqual(area, 19)
        self.assertEqual(self.reconciler.areas[area].parent_id, 18)

    def test_nearest_source_parent_can_skip_extra_regional_level(self):
        area, _ = self.reconciler.resolve_location(
            ("Canada", "Quebec", "Laurentides", "Val-David", "Mont-King")
        )
        self.assertEqual(area, 23)

    def test_newfoundland_province_alias_reuses_existing_province(self):
        area, _ = self.reconciler.resolve_location(
            ("Canada", "Newfoundland and Labrador", "Newfoundland", "Avalon Peninsula", "Flatrock")
        )
        self.assertEqual(area, 26)

    def test_thakhek_area_alias_reuses_existing_laos_area(self):
        area, _ = self.reconciler.resolve_location(
            ("Laos", "Thakhek", "Pha Tam Kam", "Music Hall", "")
        )
        self.assertIn(29, self.reconciler.path(area))

    def test_country_anchored_same_route_is_held_for_review(self):
        source = {
            "climb_name": "Sample Sheridan Route", "country": "New Zealand",
            "state_province": "Te Ika-a-Māui | The North Island", "region": "Waikato",
            "area": "Wharepapa South", "crag": "Sheridan Hills", "grade_vscale": None,
            "grade_yds": "5.10c", "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.same_name_country_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 4)

    def test_country_anchored_name_prefers_matching_crag(self):
        source = {
            "climb_name": "Hello Christine", "country": "Thailand", "state_province": "Krabi",
            "region": "Laem Phra Nang", "area": "Railay East", "crag": "Muay Thai",
            "grade_vscale": None, "grade_yds": "5.10a", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.same_name_country_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 5)

    def test_country_anchored_near_name_at_same_crag_is_reviewed(self):
        source = {
            "climb_name": "El Prado de Rey", "country": "Spain", "state_province": "Catalonia",
            "region": "Siurana", "area": "Siurana", "crag": "",
            "grade_vscale": None, "grade_yds": "5.12c", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.same_name_country_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 7)

    def test_country_anchored_transliterated_area_and_route_are_reviewed(self):
        source = {
            "climb_name": "Phra-Nang Princess", "country": "Thailand", "state_province": "Krabi",
            "region": "Laem Phra Nang", "area": "Phra Nang Beach", "crag": "Money Maker Pillar",
            "grade_vscale": None, "grade_yds": None, "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.same_name_country_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 9)

    def test_non_north_american_depth_three_area_supports_fuzzy_review(self):
        source = {
            "climb_name": "El Prado de Rey", "country": "Spain", "state_province": "Siurana",
            "region": "El Pati", "area": "", "crag": "", "grade_vscale": None,
            "grade_yds": "5.12c", "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, candidate, _, _ = self.reconciler.decide(source, mapped)
        self.assertEqual((decision, candidate.id if candidate else None), ("review", 7))

    def test_state_anchored_near_area_and_route_names_are_reviewed(self):
        source = {
            "climb_name": "Love Onsite", "country": "USA", "state_province": "California",
            "region": "High Desert", "area": "Barstow West", "crag": "New Jack City West",
            "grade_vscale": None, "grade_yds": "5.10c", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        candidate = self.reconciler.same_area_state_fuzzy_candidate(source, mapped)
        self.assertEqual(candidate.id if candidate else None, 2)

    def test_ungraded_short_spelling_at_named_laos_area_is_reviewed(self):
        source = {
            "climb_name": "Odysee", "country": "Laos", "state_province": "Thakhek",
            "region": "Pha Tam Kam", "area": "Weiße Wand", "crag": "", "grade_vscale": None,
            "grade_yds": None, "is_boulder": False, "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, candidate, _, _ = self.reconciler.decide(source, mapped)
        self.assertEqual((decision, candidate.id if candidate else None), ("review", 8))

    def test_unmapped_yds_tier_conflict_is_reviewed(self):
        source = {
            "climb_name": "Tom Sawyer", "country": "USA", "state_province": "California",
            "region": "High Desert", "area": "Barstow Area", "crag": "New Jack City",
            "grade_vscale": None, "grade_yds": "5.11", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, candidate, reason, _ = self.reconciler.decide(source, mapped)
        self.assertEqual((decision, candidate.id if candidate else None, reason),
                         ("review", 10, "grade_tier_conflict"))

    def test_unmapped_yds_with_same_tier_can_match(self):
        source = {
            "climb_name": "Same Tier", "country": "USA", "state_province": "California",
            "region": "High Desert", "area": "Barstow Area", "crag": "New Jack City",
            "grade_vscale": None, "grade_yds": "5.10", "is_boulder": False,
            "is_sport": True, "is_trad": False,
        }
        mapped, _ = self.reconciler.resolve_location(self.reconciler.location(source))
        decision, candidate, _, _ = self.reconciler.decide(source, mapped)
        self.assertEqual((decision, candidate.id if candidate else None), ("match", 11))

    def test_route_evidence_adds_parent_without_losing_betabook_child(self):
        basin = self.reconciler.add_area(4, "Basin")
        proposed = self.reconciler.add_area(basin, "Sugarloaf")
        location = ("United States", "California", "Tahoe", "Basin", "Sugarloaf")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (proposed, "aligned")
        matched = [{"openbeta_path": path, "betabook_area_id": proposed,
                    "betabook_current_area_id": 6, "move_to_area": ""},
                   {"openbeta_path": path, "betabook_area_id": proposed,
                    "betabook_current_area_id": 4, "move_to_area": ""}]
        new = [{"openbeta_path": path, "betabook_area_id": proposed}]
        decisions, reparents, unresolved = module.reconcile_parallel_areas(
            self.reconciler, {path: 5}, matched, new, [], [])
        self.assertEqual((len(decisions), reparents, unresolved), (1, [(5, 4, basin)], {}))
        self.assertEqual(self.reconciler.path_names(6)[-3:], ("Basin", "Sugarloaf", "East Face"))
        self.assertEqual(new[0]["betabook_area_id"], 5)
        self.assertEqual(matched[0]["move_to_area"], "")
        self.assertEqual(matched[1]["move_to_area"], 5)

    def test_equal_depth_parallel_area_reuses_existing(self):
        proposed = self.reconciler.add_area(9, "Sugarloaf")
        location = ("United States", "California", "Tuolumne Meadows", "Sugarloaf", "")
        path = " > ".join(x for x in location if x)
        self.reconciler.location_map[location] = (proposed, "aligned")
        matched = [{"openbeta_path": path, "betabook_area_id": proposed,
                    "betabook_current_area_id": 6, "move_to_area": ""}]
        new = [{"openbeta_path": path, "betabook_area_id": proposed}]
        decisions, reparents, unresolved = module.reconcile_parallel_areas(
            self.reconciler, {path: 5}, matched, new, [], [])
        self.assertEqual((decisions[0]["action"], reparents, unresolved), ("keep_existing", [], {}))
        self.assertEqual(self.reconciler.areas[5].parent_id, 4)
        self.assertEqual(new[0]["betabook_area_id"], 5)

    def test_wrong_state_anchor_is_rebuilt_under_old_named_parent(self):
        proposed = self.reconciler.add_area(45, "Planet of the Apes")
        location = ("Canada", "Nova Scotia", "Digby Neck", "Sandy Cove", "Planet of the Apes")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (proposed, "aligned")
        matched = [{"openbeta_path": path, "betabook_area_id": proposed,
                    "betabook_current_area_id": 43, "move_to_area": ""}]
        decisions, reparents, unresolved = module.reconcile_parallel_areas(
            self.reconciler, {path: 43}, matched, [], [], [])
        self.assertEqual((len(decisions), len(reparents), unresolved), (1, 1, {}))
        self.assertEqual(self.reconciler.path_names(43)[-4:],
                         ("Digby", "Digby Neck", "Sandy Cove", "Planet of the Apes"))
        self.assertNotIn("Halifax", self.reconciler.path_names(43))

    def test_route_evidence_merges_planned_parent_before_child(self):
        valley = self.reconciler.add_area(21, "Fraser Valley")
        planned_lake = self.reconciler.add_area(valley, "Silver Lake")
        planned_market = self.reconciler.add_area(planned_lake, "Troll Market")
        other_child = self.reconciler.add_area(planned_lake, "The Shire")
        location = ("Canada", "Quebec", "Fraser Valley", "Silver Lake", "Troll Market")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (planned_market, "aligned")
        matched = [{"openbeta_path": path, "betabook_area_id": planned_market,
                    "betabook_current_area_id": 47, "move_to_area": ""},
                   {"openbeta_path": path, "betabook_area_id": planned_market,
                    "betabook_current_area_id": 46, "move_to_area": ""}]
        decisions, reparents, unresolved = module.reconcile_parallel_areas(
            self.reconciler, {path: 47}, matched, [], [], [])
        self.assertEqual((len(decisions), unresolved), (1, {}))
        self.assertEqual([(area, old) for area, old, _ in reparents], [(46, 21), (47, 21)])
        self.assertEqual(self.reconciler.areas[46].parent_id, valley)
        self.assertEqual(self.reconciler.areas[47].parent_id, 46)
        self.assertEqual(self.reconciler.areas[other_child].parent_id, 46)
        self.assertEqual(matched[1]["move_to_area"], 47)

    def test_skipped_source_parents_are_restored_with_two_route_matches(self):
        location = ("United States", "California", "Northern California",
                    "Winslow Corridors", "Jacks Canyon")
        mapped, quality = self.reconciler.resolve_location(location)
        self.assertEqual((mapped, quality), (48, "aligned_skipped_prefix"))
        path = " > ".join(location)
        matched = [{"openbeta_path": path, "betabook_id": climb_id,
                    "betabook_current_area_id": 48, "betabook_area_path": "",
                    "area_quality": quality} for climb_id in (12, 13)]
        new = [{"openbeta_path": path, "betabook_area_id": 48,
                "betabook_area_path": "", "area_quality": quality}]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, new, [], [])
        self.assertEqual((len(decisions), len(reparents)), (1, 1))
        self.assertEqual(self.reconciler.path_names(48)[-3:],
                         ("Northern California", "Winslow Corridors", "Jack's Canyon"))
        self.assertEqual(new[0]["betabook_area_path"],
                         " > ".join(self.reconciler.path_names(48)))

    def test_one_route_match_does_not_move_skipped_source_area(self):
        location = ("United States", "California", "Northern California",
                    "Winslow Corridors", "Jacks Canyon")
        mapped, quality = self.reconciler.resolve_location(location)
        path = " > ".join(location)
        matched = [{"openbeta_path": path, "betabook_id": 12,
                    "betabook_current_area_id": 48, "area_quality": quality}]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, [], [], [])
        self.assertEqual((decisions, reparents, self.reconciler.areas[48].parent_id), ([], [], 3))

    def test_verified_source_parent_conflict_keeps_existing_area(self):
        location = ("United States", "California", "Northern California",
                    "Winslow Corridors", "Jacks Canyon")
        _, quality = self.reconciler.resolve_location(location)
        path = " > ".join(location)
        matched = [{"openbeta_path": path, "betabook_id": climb_id,
                    "betabook_current_area_id": 48, "area_quality": quality}
                   for climb_id in (12, 13)]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, [], [], [], {path: 48})
        self.assertEqual((decisions[0]["action"], reparents),
                         ("keep_existing_source_conflict", []))
        self.assertEqual(self.reconciler.areas[48].parent_id, 3)
        self.assertEqual(matched[0]["area_quality"], "source_parent_conflict")

    def test_compatible_flagstaff_source_paths_share_one_parent(self):
        broad = ("United States", "California", "Northern California",
                 "Flagstaff Bouldering", "")
        detailed = ("United States", "California", "Northern California",
                    "Flagstaff Area", "Griffith Springs")
        broad_id, broad_quality = self.reconciler.resolve_location(broad)
        detailed_id, detailed_quality = self.reconciler.resolve_location(detailed)
        self.assertEqual((broad_id, broad_quality), (49, "aligned_skipped_prefix"))
        broad_path = " > ".join(x for x in broad if x)
        detailed_path = " > ".join(x for x in detailed if x)
        matched = [
            {"openbeta_path": broad_path, "betabook_id": climb_id,
             "betabook_current_area_id": 49, "betabook_area_id": 49,
             "betabook_area_path": "", "area_quality": broad_quality}
            for climb_id in (14, 15)
        ] + [{"openbeta_path": detailed_path, "betabook_id": 16,
              "betabook_current_area_id": 49, "betabook_area_id": detailed_id,
              "betabook_area_path": "", "area_quality": detailed_quality}]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, [], [], [])
        self.assertEqual((len(decisions), len(reparents)), (1, 1))
        self.assertEqual(self.reconciler.path_names(49)[-2:],
                         ("Northern California", "Flagstaff"))
        self.assertEqual(self.reconciler.path_names(detailed_id)[-3:],
                         ("Northern California", "Flagstaff", "Griffith Springs"))
        self.assertEqual(matched[-1]["betabook_area_path"],
                         " > ".join(self.reconciler.path_names(detailed_id)))
        self.assertEqual(matched[-1]["area_quality"], "aligned_source_parents_restored")

    def test_intermediate_source_area_reuses_existing_betabook_area(self):
        first = ("United States", "California", "Northern California",
                 "Flagstaff Area", "Griffith Springs")
        second = ("United States", "California", "Northern California",
                  "Flagstaff Area", "Other Crag")
        first_area, first_quality = self.reconciler.resolve_location(first)
        second_area, second_quality = self.reconciler.resolve_location(second)
        matched = [
            {"openbeta_path": " > ".join(location), "betabook_id": climb_id,
             "betabook_current_area_id": 49, "betabook_area_id": area_id,
             "betabook_area_path": "", "area_quality": quality}
            for location, climb_id, area_id, quality in
            ((first, 14, first_area, first_quality),
             (second, 15, second_area, second_quality))
        ]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, [], [], [])
        self.assertEqual((len(decisions), len(reparents)), (1, 1))
        self.assertEqual(decisions[0]["action"], "restore_intermediate_source_parents")
        self.assertEqual(self.reconciler.path_names(49)[-2:],
                         ("Northern California", "Flagstaff"))
        self.assertEqual(self.reconciler.path_names(first_area)[-3:],
                         ("Northern California", "Flagstaff", "Griffith Springs"))

    def test_conflicting_existing_child_blocks_area_reparent(self):
        location = ("United States", "California", "Northern California",
                    "Winslow Corridors", "Jacks Canyon")
        target, quality = self.reconciler.resolve_location(location)
        parent, _ = self.reconciler.resolve_location(
            ("United States", "California", "Northern California", "Winslow Corridors", ""))
        conflict_id = 50000
        self.reconciler.areas[conflict_id] = module.Area(conflict_id, parent, "Jack's Canyon")
        self.reconciler.child_index[(parent, module.norm("Jack's Canyon"))].append(conflict_id)
        path = " > ".join(location)
        matched = [{"openbeta_path": path, "betabook_id": climb_id,
                    "betabook_current_area_id": target, "area_quality": quality}
                   for climb_id in (12, 13)]
        decisions, reparents = module.reconcile_skipped_source_parents(
            self.reconciler, matched, [], [], [])
        self.assertEqual((decisions, reparents, self.reconciler.areas[48].parent_id), ([], [], 3))

    def test_generated_duplicate_sibling_folds_into_original_area(self):
        duplicate = 50001
        self.reconciler.areas[duplicate] = module.Area(duplicate, 21, "Val David", True)
        self.reconciler.child_index[(21, module.norm("Val David"))].append(duplicate)
        child = self.reconciler.add_area(duplicate, "New Crag")
        location = ("Canada", "Quebec", "Laurentides", "Val David", "")
        self.reconciler.location_map[location] = (duplicate, "new_branch")
        new = [{"betabook_area_id": duplicate}, {"betabook_area_id": child}]
        merges = module.merge_duplicate_area_siblings(
            self.reconciler, [], new, [], [], [], [])
        self.assertEqual(len(merges), 1)
        self.assertEqual((merges[0]["generated_area_id"], merges[0]["surviving_area_id"]),
                         (duplicate, 22))
        self.assertEqual(new[0]["betabook_area_id"], 22)
        self.assertEqual(self.reconciler.areas[child].parent_id, 22)
        self.assertEqual(self.reconciler.location_map[location][0], 22)

    def test_route_evidence_rejects_unrelated_same_named_area_anchor(self):
        location = ("United States", "California", "Tuolumne Meadows",
                    "Pennyroyal Boulders", "East Face")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (6, "aligned_skipped_prefix")
        matched = [{"openbeta_path": path, "betabook_id": climb_id,
                    "betabook_current_area_id": 10, "betabook_area_id": 6,
                    "move_to_area": "", "area_quality": "aligned_skipped_prefix"}
                   for climb_id in (12, 13)]
        new = [{"openbeta_path": path, "betabook_area_id": 6,
                "area_quality": "aligned_skipped_prefix"}]
        corrected = module.correct_wrong_area_anchors(self.reconciler, matched, new, [], [])
        self.assertEqual(len(corrected), 1)
        area_id = corrected[0]["corrected_area_id"]
        self.assertEqual(self.reconciler.path_names(area_id)[-2:],
                         ("Pennyroyal Boulders", "East Face"))
        self.assertEqual(new[0]["betabook_area_id"], area_id)
        self.assertEqual([item["move_to_area"] for item in matched], [area_id, area_id])

    def test_reviewed_parent_move_preserves_original_area_id(self):
        decisions = [{"area_id": "5", "expected_old_parent_id": "4",
                      "parent_source_path": "United States > California > Tuolumne Meadows",
                      "parent_existing_area_id": "",
                      "expected_parent_path": "North America > United States > California > Tuolumne Meadows"}]
        reparents = []
        applied = module.apply_reviewed_parent_moves(self.reconciler, decisions, reparents)
        self.assertEqual(reparents, [(5, 4, 9)])
        self.assertEqual(applied[0]["existing_area_id"], 5)
        self.assertEqual(self.reconciler.path_names(6)[-3:],
                         ("Tuolumne Meadows", "Sugarloaf", "East Face"))

    def test_reviewed_source_branch_overrides_wrong_same_name_anchor(self):
        location = ("United States", "California", "Tuolumne Meadows",
                    "Pennyroyal Boulders", "East Face")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (6, "aligned_skipped_prefix")
        new = [{"openbeta_path": path, "betabook_area_id": 6, "area_quality": "aligned_skipped_prefix"}]
        matched = [{"openbeta_path": path, "betabook_current_area_id": 10,
                    "betabook_area_id": 6, "move_to_area": ""}]
        decision = [{"openbeta_path": path,
                     "expected_wrong_area_path": " > ".join(self.reconciler.path_names(6)),
                     "expected_parent_path": " > ".join(self.reconciler.path_names(10)),
                     "expected_new_routes": "1", "evidence": "reviewed routes", "confidence": "high"}]
        applied = module.force_reviewed_source_branches(
            self.reconciler, decision, matched, new, [], [])
        corrected = applied[0]["corrected_area_id"]
        self.assertEqual(self.reconciler.path_names(corrected)[-2:],
                         ("Pennyroyal Boulders", "East Face"))
        self.assertEqual(new[0]["betabook_area_id"], corrected)
        self.assertEqual(matched[0]["move_to_area"], corrected)

    def test_reviewed_area_hold_removes_new_routes_from_import(self):
        location = ("United States", "California", "Tahoe", "Sugarloaf", "")
        path = " > ".join(x for x in location if x)
        self.reconciler.location_map[location] = (5, "aligned")
        new = [{"openbeta_id": "a", "openbeta_path": path, "betabook_area_id": 5}]
        review = []
        rows, count = module.hold_reviewed_area_paths(
            self.reconciler,
            [{"openbeta_path": path, "expected_new_routes": "1", "reason": "ambiguous",
              "confidence": "high", "evidence_url": ""}], new, review, {})
        self.assertEqual((len(rows), count, len(new), review[0]["reason"]),
                         (1, 1, 0, "reviewed_area_hold"))

    def test_route_evidence_area_conflict_holds_new_climbs(self):
        location = ("United States", "California", "Tahoe", "Sugarloaf", "East Face")
        path = " > ".join(location)
        self.reconciler.location_map[location] = (6, "aligned")
        matched = [{"openbeta_path": path, "openbeta_name": "Name A",
                    "betabook_current_area_id": 14, "move_to_area": ""}]
        new = [{"openbeta_id": "source-new", "openbeta_path": path,
                "betabook_area_id": 6}]
        review = []
        rows, count = module.hold_route_evidence_area_conflicts(
            self.reconciler, matched, new, review, {})
        self.assertEqual((len(rows), count, len(new), review[0]["reason"]),
                         (1, 1, 0, "route_evidence_area_conflict"))
        self.assertEqual(self.reconciler.location_map[location][1],
                         "route_evidence_area_conflict")

    def test_nearby_same_name_source_climbs_are_held_across_paths(self):
        first = {"openbeta_id": "a", "openbeta_name": "A Rare Name",
                 "openbeta_path": "United States > Utah > Crag A", "openbeta_grade": "V5",
                 "type": "boulder", "grade": 6}
        second = {"openbeta_id": "b", "openbeta_name": "A Rare Name",
                  "openbeta_path": "United States > Utah > Crag B", "openbeta_grade": "V5",
                  "type": "boulder", "grade": 6}
        low = {"openbeta_id": "c", "openbeta_name": "A Rare Name Low",
               "openbeta_path": "United States > Utah > Crag B", "openbeta_grade": "V5",
               "type": "boulder", "grade": 6}
        sources = {
            "a": {"climb_name": first["openbeta_name"], "country": "United States",
                  "state_province": "Utah", "latitude": 39.0, "longitude": -110.0},
            "b": {"climb_name": second["openbeta_name"], "country": "United States",
                  "state_province": "Utah", "latitude": 39.001, "longitude": -110.001},
            "c": {"climb_name": low["openbeta_name"], "country": "United States",
                  "state_province": "Utah", "latitude": 39.001, "longitude": -110.001},
        }
        pairs, held = module.nearby_same_name_source_pairs([first, second, low], sources)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(held, {"a", "b"})

if __name__ == "__main__":
    unittest.main()
