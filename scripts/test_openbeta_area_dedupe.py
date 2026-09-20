"""Focused checks for catalog-wide area duplicate candidate discovery."""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("openbeta-audit-area-dedupe.py")
spec = importlib.util.spec_from_file_location("openbeta_area_dedupe_test", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class AreaDedupeAuditTest(unittest.TestCase):
    def test_parallel_subtrees_and_parenthetical_sibling_aliases_are_candidates(self):
        import sqlite3

        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "fixture.sqlite"
            db = sqlite3.connect(database)
            db.executescript("""
                CREATE TABLE areas (id INTEGER PRIMARY KEY,parent_id INTEGER,name TEXT);
                CREATE TABLE climbs (id INTEGER PRIMARY KEY,area_id INTEGER,name TEXT,
                                     type TEXT,grade INTEGER,send_count INTEGER DEFAULT 0);
                CREATE TABLE catalog_route_sources (climb_id INTEGER,latitude REAL,
                                                    longitude REAL,status TEXT);
                INSERT INTO areas VALUES
                  (1,NULL,'North America'),(2,1,'United States'),(3,2,'Nevada'),
                  (4,3,'Red Rocks'),(5,4,'First Pullout'),
                  (6,4,'First Pullout (Calico I)'),
                  (7,3,'Squamish'),(8,7,'Powell River'),(9,8,'Higgyland'),
                  (10,3,'Sunshine Coast'),(11,10,'Powell River'),
                  (12,11,'Higgyland');
                INSERT INTO climbs VALUES
                  (1,9,'Bumcrack','sport',8,0),
                  (2,12,'Bumcrack','sport',8,0);
                INSERT INTO catalog_route_sources VALUES
                  (1,49.88,-124.54,'matched'),(2,49.88,-124.54,'matched');
            """)
            db.close()
            rows, _, _ = module.candidates(database, 12, 2)
            by_pair = {
                frozenset((row["first_area_id"], row["second_area_id"])): row
                for row in rows
            }
            alias = by_pair[frozenset((5, 6))]
            self.assertIn("same_parent_alias_name", alias["signals"])
            parallel = by_pair[frozenset((8, 11))]
            self.assertIn("parallel_equivalent_name", parallel["signals"])
            self.assertIn("parallel_subtree_route_overlap", parallel["signals"])
            self.assertIn("parallel_subtree_gps_nearby", parallel["signals"])
            self.assertEqual(parallel["shared_subtree_route_names"], 1)

    def test_unknown_route_evidence_finds_known_place_without_merging_starts(self):
        import sqlite3

        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "fixture.sqlite"
            db = sqlite3.connect(database)
            db.executescript("""
                CREATE TABLE areas (id INTEGER PRIMARY KEY,parent_id INTEGER,name TEXT);
                CREATE TABLE climbs (id INTEGER PRIMARY KEY,area_id INTEGER,name TEXT,
                                     type TEXT,grade INTEGER,send_count INTEGER DEFAULT 0);
                CREATE TABLE catalog_route_sources (climb_id INTEGER,latitude REAL,
                                                    longitude REAL,status TEXT);
                INSERT INTO areas VALUES
                  (1,NULL,'Uncategorized'),(2,1,'Unknown'),(3,2,'FlockHill'),
                  (4,NULL,'Oceania'),(5,4,'New Zealand'),(6,5,'Flock Hill');
                INSERT INTO climbs VALUES
                  (1,3,'Wristy Business','boulder',6,0),
                  (2,6,'Wristy Business','boulder',6,0),
                  (3,3,'Ghost Dance Sit','boulder',7,0),
                  (4,6,'Ghost Dance','boulder',7,0);
            """)
            db.close()
            rows, _, summary = module.candidates(database, 6, 4)
            pair = next(row for row in rows
                        if {row["first_area_id"], row["second_area_id"]} == {3, 6})
            self.assertIn("unknown_to_geographic_route_evidence", pair["signals"])
            self.assertIn("unknown_to_geographic_name_only", pair["signals"])
            self.assertEqual(pair["shared_route_names"], 1)
            self.assertEqual(summary["areas_scanned"], 6)


if __name__ == "__main__":
    unittest.main()
