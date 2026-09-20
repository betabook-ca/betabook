#!/usr/bin/env python3
"""Build a migrated SQLite preview from a catalog dump and generated import SQL."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sqlite3
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_sql(connection: sqlite3.Connection, content: str, label: str) -> None:
    try:
        connection.executescript("BEGIN;\n" + content + "\nCOMMIT;")
    except Exception as error:
        connection.rollback()
        raise RuntimeError(f"Could not apply {label}") from error


def build(catalog_sql: Path, import_dir: Path, output: Path) -> dict:
    manifest = json.loads((import_dir / "manifest.json").read_text())
    if digest(catalog_sql) != manifest["catalog_sha256"]:
        raise ValueError("The catalog dump differs from the inspected snapshot")
    parquet = Path(manifest["parquet"])
    if not parquet.is_absolute():
        parquet = Path.cwd() / parquet
    if digest(parquet) != manifest["parquet_sha256"]:
        raise ValueError("The parquet differs from the inspected release")
    if manifest.get("audit_candidates"):
        audit = Path(manifest["audit_candidates"])
        if not audit.is_absolute():
            audit = Path.cwd() / audit
        if digest(audit) != manifest["audit_candidates_sha256"]:
            raise ValueError("The audit curation differs from the reviewed candidates")
    for field in ("audited_promotions", "distinct_crags", "subarea_corroborations",
                  "area_placement_exceptions", "reviewed_source_branches",
                  "reviewed_area_alignments", "reviewed_parent_moves",
                  "rejected_matches", "reviewed_area_holds", "reviewed_new_releases",
                  "reviewed_area_aliases", "reviewed_pre_match_parent_moves",
                  "reviewed_route_moves", "reviewed_source_parent_conflicts",
                  "reviewed_original_area_merges", "reviewed_final_parent_moves",
                  "reviewed_final_climb_moves", "reviewed_final_source_area_alignments"):
        if manifest.get(field):
            reviewed = Path(manifest[field])
            if not reviewed.is_absolute():
                reviewed = Path.cwd() / reviewed
            if digest(reviewed) != manifest[field + "_sha256"]:
                raise ValueError(f"The {field} file differs from the reviewed input")
    if manifest.get("reviewed_final_route_links"):
        reviewed = Path(manifest["reviewed_final_route_links"])
        if not reviewed.is_absolute():
            reviewed = Path.cwd() / reviewed
        if digest(reviewed) != manifest["reviewed_final_route_links_sha256"]:
            raise ValueError("The reviewed final route links differ from the reviewed input")
    semantic_checks = None
    if manifest.get("reviewed_final_semantic"):
        reviewed = Path(manifest["reviewed_final_semantic"])
        if not reviewed.is_absolute():
            reviewed = Path.cwd() / reviewed
        if digest(reviewed) != manifest["reviewed_final_semantic_sha256"]:
            raise ValueError("The reviewed semantic checks differ from the reviewed input")
        semantic_checks = json.loads(reviewed.read_text())
        semantic_sql = Path(semantic_checks["sql"])
        if not semantic_sql.is_absolute():
            semantic_sql = Path.cwd() / semantic_sql
        if digest(semantic_sql) != manifest["reviewed_final_semantic_sql_sha256"]:
            raise ValueError("The reviewed semantic SQL differs from the reviewed input")
        if digest(import_dir / "sql" / "80-reviewed-final-semantic.sql") != manifest["reviewed_final_semantic_sql_sha256"]:
            raise ValueError("The generated semantic SQL differs from the reviewed input")
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(output)
    try:
        connection.execute("PRAGMA journal_mode=MEMORY")
        connection.execute("PRAGMA synchronous=OFF")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)"
        )
        for migration in sorted((Path(__file__).parents[1] / "drizzle" / "migrations").glob("*.sql")):
            quoted_name = migration.name.replace("'", "''")
            apply_sql(connection, migration.read_text() + f"\nINSERT INTO d1_migrations(name) VALUES('{quoted_name}');",
                      migration.name)
        apply_sql(connection, catalog_sql.read_text(), "production catalog dump")
        original_areas = {row[0]: row[1:] for row in connection.execute(
            "SELECT id,parent_id,name,description FROM areas")}
        original_climbs = {row[0]: row[1:] for row in connection.execute(
            "SELECT id,area_id,name,type,grade,description FROM climbs")}
        for name in manifest["sql_order"]:
            apply_sql(connection, (import_dir / "sql" / name).read_text(), name)

        expected_area_parents = {
            int(row["area_id"]): int(row["new_parent_id"])
            for row in csv.DictReader((import_dir / "area_reparents.csv").open())
        }
        expected_climb_areas = {
            int(row["betabook_id"]): int(row["move_to_area"])
            for row in csv.DictReader((import_dir / "moves.csv").open())
        }
        final_climb_moves = list(csv.DictReader((import_dir / "reviewed_final_climb_moves.csv").open()))
        expected_climb_areas.update({int(row["climb_id"]): int(row["target_area_id"])
                                     for row in final_climb_moves})
        final_route_links = list(csv.DictReader((import_dir / "reviewed_final_route_links.csv").open()))
        expected_climb_areas.update({int(row["original_climb_id"]): int(row["expected_new_area_id"])
                                     for row in final_route_links
                                     if row["relationship"] in {"new_descendant", "reviewed_cross_branch"}})
        if semantic_checks:
            expected_climb_areas.update({int(row["id"]): int(row["area_id"])
                                         for row in semantic_checks["climb_moves"]
                                         if int(row["id"]) <= manifest["existing_climb_max_id"]})
        original_merges = list(csv.DictReader((import_dir / "reviewed_original_area_merges.csv").open()))
        redirects = {int(row["duplicate_area_id"]): int(row["survivor_area_id"])
                     for row in original_merges}
        renames = {int(row["survivor_area_id"]): row["survivor_display_name"]
                   for row in original_merges if row.get("survivor_display_name")}
        merged_parent_moves = {int(row["survivor_area_id"]): int(row["survivor_new_parent_area_id"])
                               for row in original_merges if row.get("survivor_new_parent_area_id")}
        final_parent_moves = list(csv.DictReader((import_dir / "reviewed_final_parent_moves.csv").open()))
        final_parent_by_id = {int(row["area_id"]): int(row["new_parent_id"])
                              for row in final_parent_moves}
        semantic_parent_by_id = ({int(row["id"]): int(row["parent_id"])
                                  for row in semantic_checks["area_parent_moves"]}
                                 if semantic_checks else {})
        semantic_renames = ({int(row["id"]): row["name"]
                             for row in semantic_checks.get("area_renames", [])}
                            if semantic_checks else {})
        semantic_deleted = ({int(row["id"]) for row in semantic_checks.get("deleted_areas", [])}
                            if semantic_checks else set())
        final_source_area_alignments = list(csv.DictReader(
            (import_dir / "reviewed_final_source_area_alignments.csv").open()))

        def redirect(area_id: int | None) -> int | None:
            seen = set()
            while area_id in redirects:
                if area_id in seen:
                    raise ValueError(f"Cyclic reviewed area merge: {area_id}")
                seen.add(area_id)
                area_id = redirects[area_id]
            return area_id

        for area_id, original in original_areas.items():
            actual = connection.execute(
                "SELECT parent_id,name,description FROM areas WHERE id=?", (area_id,)).fetchone()
            if area_id in redirects or area_id in semantic_deleted:
                expected = None
            else:
                expected = (redirect(semantic_parent_by_id.get(area_id,
                                    final_parent_by_id.get(area_id,
                                                            merged_parent_moves.get(area_id,
                                                                                    expected_area_parents.get(area_id, original[0]))))),
                            semantic_renames.get(area_id,
                                                 renames.get(area_id, original[1])), original[2])
            if actual != expected:
                raise ValueError(f"Unexpected original area change: {area_id}: {actual} != {expected}")
        for climb_id, original in original_climbs.items():
            actual = connection.execute(
                "SELECT area_id,name,type,grade,description FROM climbs WHERE id=?", (climb_id,)).fetchone()
            expected = (redirect(expected_climb_areas.get(climb_id, original[0])),) + original[1:]
            if actual != expected:
                raise ValueError(f"Unexpected original climb change: {climb_id}: {actual} != {expected}")
        for row in final_parent_moves:
            actual = connection.execute("SELECT parent_id,name FROM areas WHERE id=?",
                                        (int(row["area_id"]),)).fetchone()
            expected = (int(row["new_parent_id"]),
                        semantic_renames.get(int(row["area_id"]), row["area_name"]))
            if actual != expected:
                raise ValueError(f"Final area parent move changed: {row['area_id']}: {actual} != {expected}")
        for row in final_source_area_alignments:
            actual = connection.execute(
                "SELECT area_id,quality FROM catalog_area_sources "
                "WHERE source='openbeta' AND source_path=?", (row["source_path"],)).fetchone()
            expected = (int(row["target_area_id"]), "reviewed_area_identity")
            if actual != expected:
                raise ValueError(f"Final source-area identity changed: {row['source_path']}: "
                                 f"{actual} != {expected}")
        for row in final_route_links:
            new_id, original_id = int(row["new_climb_id"]), int(row["original_climb_id"])
            if connection.execute("SELECT 1 FROM climbs WHERE id=?", (new_id,)).fetchone():
                raise ValueError(f"Reviewed duplicate new climb was not removed: {new_id}")
            actual = connection.execute(
                "SELECT climb_id,status,match_kind FROM catalog_route_sources "
                "WHERE source='openbeta' AND source_id=?", (row["openbeta_id"],)).fetchone()
            match_kind = ("reviewed_cross_branch_route"
                          if row["relationship"].startswith("reviewed_cross_branch")
                          else "reviewed_name_alias_route"
                          if row["relationship"] == "reviewed_alias_same_area"
                          else "reviewed_post_area_merge")
            if actual != (original_id, "matched", match_kind):
                raise ValueError(f"Reviewed source UUID was not relinked: {row['openbeta_id']}")
        if semantic_checks:
            for row in semantic_checks["new_areas"]:
                actual = connection.execute(
                    "SELECT parent_id,name FROM areas WHERE id=?", (int(row["id"]),)).fetchone()
                if actual != (int(row["parent_id"]), row["name"]):
                    raise ValueError(f"Reviewed new semantic area changed: {row['id']}: {actual}")
            for row in semantic_checks["area_parent_moves"]:
                actual = connection.execute(
                    "SELECT parent_id,name FROM areas WHERE id=?", (int(row["id"]),)).fetchone()
                if actual != (int(row["parent_id"]), row["name"]):
                    raise ValueError(f"Reviewed semantic parent changed: {row['id']}: {actual}")
            for row in semantic_checks.get("area_renames", []):
                actual = connection.execute(
                    "SELECT parent_id,name FROM areas WHERE id=?", (int(row["id"]),)).fetchone()
                if actual != (int(row["parent_id"]), row["name"]):
                    raise ValueError(f"Reviewed semantic area rename changed: {row['id']}: {actual}")
            for row in semantic_checks.get("deleted_areas", []):
                actual = connection.execute(
                    "SELECT id FROM areas WHERE id=?", (int(row["id"]),)).fetchone()
                if actual is not None:
                    raise ValueError(f"Reviewed empty legacy area remains: {row['id']}")
            for row in semantic_checks["climb_moves"]:
                actual = connection.execute(
                    "SELECT area_id,name FROM climbs WHERE id=?", (int(row["id"]),)).fetchone()
                if actual != (int(row["area_id"]), row["name"]):
                    raise ValueError(f"Reviewed semantic climb changed: {row['id']}: {actual}")
            for row in semantic_checks["held_source_links"]:
                actual = connection.execute(
                    "SELECT climb_id,status,match_kind FROM catalog_route_sources "
                    "WHERE source='openbeta' AND source_id=?", (row["source_id"],)).fetchone()
                if actual != (int(row["climb_id"]), "matched", "reviewed_source_route"):
                    raise ValueError(f"Reviewed held source link changed: {row['source_id']}")
            for row in semantic_checks.get("source_area_alignments", []):
                actual = connection.execute(
                    "SELECT area_id,quality FROM catalog_area_sources "
                    "WHERE source='openbeta' AND source_path=?",
                    (row["source_path"],)).fetchone()
                if actual != (int(row["area_id"]), row["quality"]):
                    raise ValueError(f"Reviewed semantic source area changed: {row['source_path']}")

        result = {
            "areas": connection.execute("SELECT COUNT(*) FROM areas").fetchone()[0],
            "climbs": connection.execute("SELECT COUNT(*) FROM climbs").fetchone()[0],
            "new_climbs_without_grade": connection.execute(
                "SELECT COUNT(*) FROM climbs WHERE id>? AND grade IS NULL",
                (manifest["existing_climb_max_id"],)).fetchone()[0],
            "route_crosswalks": connection.execute("SELECT COUNT(*) FROM catalog_route_sources").fetchone()[0],
            "area_crosswalks": connection.execute("SELECT COUNT(*) FROM catalog_area_sources").fetchone()[0],
            "linked_routes": connection.execute("SELECT COUNT(*) FROM catalog_route_sources WHERE climb_id IS NOT NULL").fetchone()[0],
            "foreign_key_errors": connection.execute("PRAGMA foreign_key_check").fetchall(),
            "integrity": connection.execute("PRAGMA integrity_check").fetchone()[0],
            "original_area_reparents_verified": len(expected_area_parents),
            "original_area_merges_verified": len(original_merges),
            "final_area_parent_moves_verified": len(final_parent_moves),
            "original_climb_moves_verified": len(expected_climb_areas),
            "reviewed_final_climb_moves_verified": len(final_climb_moves),
            "reviewed_source_area_alignments_verified": len(final_source_area_alignments),
            "reviewed_final_route_links_verified": len(final_route_links),
            "reviewed_semantic_deleted_areas_verified": len(semantic_deleted),
            "new_source_links": connection.execute(
                "SELECT COUNT(*) FROM catalog_route_sources WHERE status='new'").fetchone()[0],
            "matched_source_links": connection.execute(
                "SELECT COUNT(*) FROM catalog_route_sources WHERE status='matched'").fetchone()[0],
        }
        expected = {
            "areas": (manifest["existing_areas"] + manifest["new_areas"] - len(original_merges)
                      + manifest.get("reviewed_final_semantic_new_areas", 0)
                      - manifest.get("reviewed_final_semantic_deleted_areas", 0)),
            "climbs": manifest["existing_climbs"] + manifest["final_new_climbs"],
            "new_climbs_without_grade": 0,
            "route_crosswalks": manifest["source_routes"],
            "area_crosswalks": manifest["area_crosswalks"],
            "linked_routes": manifest["gps_linked"],
            "foreign_key_errors": [],
            "integrity": "ok",
            "original_area_reparents_verified": manifest["areas_reparented"],
            "original_area_merges_verified": manifest["reviewed_original_area_merges_applied"],
            "final_area_parent_moves_verified": manifest["reviewed_final_parent_moves_applied"],
            "original_climb_moves_verified": (manifest["proposed_moves"]
                                              + manifest["reviewed_final_climb_moves_applied"]
                                              + manifest["reviewed_final_route_climb_moves"]
                                              + manifest.get("reviewed_final_semantic_original_climb_moves", 0)),
            "reviewed_final_climb_moves_verified": manifest["reviewed_final_climb_moves_applied"],
            "reviewed_source_area_alignments_verified": manifest["reviewed_final_source_area_alignments_applied"],
            "reviewed_final_route_links_verified": manifest["reviewed_final_route_links_applied"],
            "reviewed_semantic_deleted_areas_verified": manifest.get("reviewed_final_semantic_deleted_areas", 0),
            "new_source_links": manifest["final_new_source_links"],
            "matched_source_links": manifest["final_matched_source_links"],
        }
        if result != expected:
            raise ValueError(f"Preview validation failed: {result}; expected {expected}")
        return result
    finally:
        connection.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-sql", required=True, type=Path)
    parser.add_argument("--import-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    options = parser.parse_args()
    result = build(options.catalog_sql, options.import_dir, options.output)
    (options.import_dir / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
