#!/usr/bin/env python3
"""Audit a built OpenBeta preview for unresolved route and area contradictions."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import sqlite3
import sys
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path


SCRIPT = Path(__file__).with_name("openbeta-reconcile.py")
spec = importlib.util.spec_from_file_location("openbeta_reconcile_audit", SCRIPT)
assert spec and spec.loader
reconcile = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = reconcile
spec.loader.exec_module(reconcile)


def write_csv(path: Path, rows: list[dict], columns: tuple[str, ...]) -> None:
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, columns)
        writer.writeheader()
        writer.writerows(rows)


def km(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    value = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(value)))


def audit(database: Path, manifest_path: Path, output: Path,
          priority_decisions: Path | None = None,
          route_exceptions: Path | None = None) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text())
    base_area_max = manifest["existing_area_max_id"]
    base_climb_max = manifest["existing_climb_max_id"]
    db = sqlite3.connect(database)
    areas = {ident: (parent, name) for ident, parent, name in
             db.execute("SELECT id,parent_id,name FROM areas")}
    paths: dict[int, tuple[int, ...]] = {}

    def path(area_id: int) -> tuple[int, ...]:
        if area_id not in paths:
            parent = areas[area_id][0]
            paths[area_id] = (path(parent) if parent else ()) + (area_id,)
        return paths[area_id]

    def names(area_id: int) -> str:
        return " > ".join(areas[ident][1] for ident in path(area_id))

    rows = list(db.execute(
        "SELECT r.source_id,r.source_name,r.source_path,r.source_grade,r.source_type,"
        "r.latitude,r.longitude,r.status,r.climb_id,a.area_id,c.area_id "
        "FROM catalog_route_sources r "
        "LEFT JOIN catalog_area_sources a ON a.source=r.source AND a.source_path=r.source_path "
        "LEFT JOIN climbs c ON c.id=r.climb_id"
    ))
    status_counts = Counter(row[7] for row in rows)
    matched_unrelated: dict[str, list[tuple]] = defaultdict(list)
    new_by_path: Counter[str] = Counter()
    review_by_path: Counter[str] = Counter()
    counts_by_source_path: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        uuid, source_name, source_path, grade, typ, lat, lon, status, climb_id, mapped, climb_area = row
        counts_by_source_path[source_path][status] += 1
        if status == "new":
            new_by_path[source_path] += 1
        elif status == "review":
            review_by_path[source_path] += 1
        if status != "matched" or mapped is None or climb_area is None:
            continue
        candidate, source_area = path(climb_area), path(mapped)
        if candidate[: len(source_area)] != source_area and source_area[: len(candidate)] != candidate:
            matched_unrelated[source_path].append(row)
    unrelated_rows = []
    for source_path, source_rows in matched_unrelated.items():
        mapped = source_rows[0][9]
        old_areas = Counter(row[10] for row in source_rows)
        unrelated_rows.append({
            "openbeta_path": source_path,
            "unrelated_matched_routes": len(source_rows),
            "new_source_uuids": new_by_path[source_path],
            "review_source_uuids": review_by_path[source_path],
            "mapped_area_id": mapped or "",
            "mapped_area_path": names(mapped) if mapped else "",
            "matched_betabook_area_ids": "; ".join(str(ident) for ident, _ in old_areas.most_common()),
            "matched_betabook_paths": "; ".join(names(ident) for ident, _ in old_areas.most_common()),
            "sample_route_names": "; ".join(dict.fromkeys(row[1] for row in source_rows[:5])),
        })
    unrelated_rows.sort(key=lambda row: (-row["unrelated_matched_routes"], row["openbeta_path"]))
    write_csv(output / "audit-unrelated-route-areas.csv", unrelated_rows,
              ("openbeta_path", "unrelated_matched_routes", "new_source_uuids",
               "review_source_uuids", "mapped_area_id", "mapped_area_path",
               "matched_betabook_area_ids", "matched_betabook_paths", "sample_route_names"))

    original: dict[tuple, list[tuple[int, int | None, int]]] = defaultdict(list)
    reviewed_release_file = manifest_path.parent / "reviewed_new_releases.csv"
    reviewed_new_ids = {row["openbeta_id"] for row in csv.DictReader(reviewed_release_file.open())} \
        if reviewed_release_file.exists() else set()
    geographic_exceptions = {}
    if route_exceptions:
        for row in csv.DictReader(route_exceptions.open()):
            key = (row["openbeta_id"], int(row["new_climb_id"]), int(row["original_climb_id"]))
            if key in geographic_exceptions or not row["evidence_url"]:
                raise ValueError(f"Invalid reviewed route geography exception: {key}")
            geographic_exceptions[key] = row
    observed_exceptions = set()
    climb_areas = {}
    for ident, area_id, name, climb_type, grade in db.execute(
            "SELECT id,area_id,name,type,grade FROM climbs WHERE id<=?", (base_climb_max,)):
        climb_areas[ident] = area_id
        geo = tuple(reconcile.norm(areas[value][1]) for value in path(area_id)[1:3])
        core, variant = reconcile.name_parts(name)
        original[(geo, climb_type, core, variant)].append((ident, grade, area_id))
    exact_overlaps = []
    for uuid, source_name, source_path, raw_grade, climb_type, _, _, status, climb_id, _, _ in rows:
        if status != "new" or reconcile.is_unnamed_climb(source_name):
            continue
        tokens = source_path.split(" > ")
        if len(tokens) < 2:
            continue
        country = reconcile.COUNTRY_NAMES.get(tokens[0], tokens[0])
        state = reconcile.canonical_state(country, tokens[1])
        geo = (reconcile.norm(country), reconcile.norm(state))
        core, variant = reconcile.name_parts(source_name)
        parsed, _, _ = reconcile.parse_grade(
            climb_type, raw_grade if climb_type == "boulder" else None,
            raw_grade if climb_type != "boulder" else None)
        for old_id, old_grade, old_area in original.get((geo, climb_type, core, variant), []):
            if parsed is not None and old_grade is not None and abs(parsed - old_grade) > 1:
                continue
            pair_key = (uuid, climb_id, old_id)
            if pair_key in geographic_exceptions:
                observed_exceptions.add(pair_key)
            exact_overlaps.append({
                "openbeta_id": uuid, "openbeta_name": source_name,
                "openbeta_path": source_path, "new_climb_id": climb_id,
                "original_climb_id": old_id, "original_area_path": names(old_area),
                "openbeta_grade": raw_grade or "", "original_grade_ordinal": old_grade if old_grade is not None else "",
                "reviewed_geographic_exception": (uuid in reviewed_new_ids
                                                   or pair_key in geographic_exceptions),
            })
    if observed_exceptions != set(geographic_exceptions):
        raise ValueError("A reviewed route geography exception is no longer a candidate")
    write_csv(output / "audit-new-original-exact-candidates.csv", exact_overlaps,
              ("openbeta_id", "openbeta_name", "openbeta_path", "new_climb_id",
               "original_climb_id", "original_area_path", "openbeta_grade",
               "original_grade_ordinal", "reviewed_geographic_exception"))

    # Existing broad and specific Betabook entries can already be duplicates.
    # Keep both original IDs intact, but expose the pair when a linked source
    # route makes the choice material to this import.
    source_ids_by_original: dict[int, list[str]] = defaultdict(list)
    for row in rows:
        if row[7] == "matched" and row[8] is not None and row[8] <= base_climb_max:
            source_ids_by_original[row[8]].append(row[0])
    original_by_name: dict[tuple, list[tuple[int, int, str, int]]] = defaultdict(list)
    for ident, area_id, name, climb_type, grade in db.execute(
            "SELECT id,area_id,name,type,grade FROM climbs WHERE id<=? AND grade IS NOT NULL",
            (base_climb_max,)):
        if reconcile.is_unnamed_climb(name):
            continue
        core, variant = reconcile.name_parts(name)
        geo = tuple(reconcile.norm(areas[value][1]) for value in path(area_id)[1:3])
        original_by_name[(geo, climb_type, core, variant)].append((ident, area_id, name, grade))
    original_duplicate_candidates = []
    for candidates in original_by_name.values():
        if len(candidates) < 2:
            continue
        for first, second in combinations(candidates, 2):
            first_id, first_area, first_name, first_grade = first
            second_id, second_area, second_name, second_grade = second
            if abs(first_grade - second_grade) > 1:
                continue
            first_path, second_path = path(first_area), path(second_area)
            related = (first_path[:len(second_path)] == second_path
                       or second_path[:len(first_path)] == first_path)
            if not related or not (source_ids_by_original[first_id]
                                   or source_ids_by_original[second_id]):
                continue
            original_duplicate_candidates.append({
                "first_climb_id": first_id, "first_name": first_name,
                "first_area_path": names(first_area), "first_grade_ordinal": first_grade,
                "second_climb_id": second_id, "second_name": second_name,
                "second_area_path": names(second_area), "second_grade_ordinal": second_grade,
                "matched_source_uuids": "; ".join(
                    source_ids_by_original[first_id] + source_ids_by_original[second_id]),
            })
    original_duplicate_candidates.sort(key=lambda row: (row["first_climb_id"], row["second_climb_id"]))
    write_csv(output / "audit-original-climb-overlap-candidates.csv",
              original_duplicate_candidates,
              ("first_climb_id", "first_name", "first_area_path", "first_grade_ordinal",
               "second_climb_id", "second_name", "second_area_path",
               "second_grade_ordinal", "matched_source_uuids"))

    siblings: dict[tuple[int | None, str], list[int]] = defaultdict(list)
    for area_id, (parent, name) in areas.items():
        siblings[(parent, reconcile.area_norm(name).replace(" ", ""))].append(area_id)
    duplicate_areas = []
    for (parent, _), ids in siblings.items():
        if len(ids) < 2 or not any(ident <= base_area_max for ident in ids) or not any(ident > base_area_max for ident in ids):
            continue
        duplicate_areas.append({
            "parent_area_id": parent or "", "parent_path": names(parent) if parent else "",
            "original_area_ids": "; ".join(str(ident) for ident in ids if ident <= base_area_max),
            "generated_area_ids": "; ".join(str(ident) for ident in ids if ident > base_area_max),
            "area_names": "; ".join(areas[ident][1] for ident in ids),
        })
    write_csv(output / "audit-original-generated-area-siblings.csv", duplicate_areas,
              ("parent_area_id", "parent_path", "original_area_ids", "generated_area_ids", "area_names"))
    original_siblings = []
    for (parent, _), ids in siblings.items():
        originals = [ident for ident in ids if ident <= base_area_max]
        if len(originals) < 2:
            continue
        original_siblings.append({
            "parent_area_id": parent or "", "parent_path": names(parent) if parent else "",
            "original_area_ids": "; ".join(map(str, originals)),
            "area_names": "; ".join(areas[ident][1] for ident in originals),
        })
    original_siblings.sort(key=lambda row: (row["parent_path"], row["area_names"]))
    write_csv(output / "audit-original-original-area-siblings.csv", original_siblings,
              ("parent_area_id", "parent_path", "original_area_ids", "area_names"))

    # A leaf-name alignment can conceal a different geographic parent. This
    # report is deliberately a review queue: aliases such as Tahoe/Lake Tahoe
    # need semantic judgment, while a Boulder Canyon Dome mapped from South
    # Platte is a genuine wrong-branch import.
    ancestry_conflicts = []
    for source_path, mapped, quality in db.execute(
            "SELECT source_path,area_id,quality FROM catalog_area_sources "
            "WHERE source='openbeta' AND area_id IS NOT NULL"):
        if mapped > base_area_max or quality not in {"aligned_skipped_prefix", "aligned"}:
            continue
        source_tokens = source_path.split(" > ")
        mapped_tokens = [areas[ident][1] for ident in path(mapped)]
        if len(source_tokens) < 4 or len(mapped_tokens) < 5:
            continue
        source_ancestors = {reconcile.area_norm(value).replace(" ", "")
                            for value in source_tokens[2:-1]}
        mapped_ancestors = {reconcile.area_norm(value).replace(" ", "")
                            for value in mapped_tokens[3:-1]}
        if source_ancestors & mapped_ancestors:
            continue
        counts = counts_by_source_path[source_path]
        if not counts["new"] and not counts["matched"]:
            continue
        ancestry_conflicts.append({
            "openbeta_path": source_path, "mapped_area_id": mapped,
            "mapped_area_path": names(mapped), "area_quality": quality,
            "new_source_uuids": counts["new"], "matched_source_uuids": counts["matched"],
            "review_source_uuids": counts["review"],
        })
    ancestry_conflicts.sort(key=lambda row: (-row["new_source_uuids"], row["openbeta_path"]))
    write_csv(output / "audit-source-prefix-ancestry.csv", ancestry_conflicts,
              ("openbeta_path", "mapped_area_id", "mapped_area_path", "area_quality",
               "new_source_uuids", "matched_source_uuids", "review_source_uuids"))

    alias_file = manifest_path.parent / "reviewed_area_alias_decisions.csv"
    aliases = list(csv.DictReader(alias_file.open())) if alias_file.exists() else []
    missing_parent_rows = []
    for source_path, mapped, quality in db.execute(
            "SELECT source_path,area_id,quality FROM catalog_area_sources "
            "WHERE source='openbeta' AND area_id IS NOT NULL"):
        original_ancestors = [ident for ident in path(mapped)
                              if ident <= base_area_max and len(path(ident)) >= 4]
        if not original_ancestors:
            continue
        anchor = original_ancestors[-1]
        source_tokens = source_path.split(" > ")
        if len(source_tokens) < 4:
            continue
        source_segments = reconcile.source_area_segments(source_tokens[2:], source_tokens[1])
        source_norms = [reconcile.area_norm(value).replace(" ", "")
                        for value in source_segments]
        for alias in sorted(aliases, key=lambda row: -len(row["openbeta_prefix"])):
            prefix = alias["openbeta_prefix"]
            original_id = int(alias["existing_area_id"])
            if (original_id not in path(mapped)
                    or not (source_path == prefix or source_path.startswith(prefix + " > "))):
                continue
            alias_segments = reconcile.source_area_segments(prefix.split(" > ")[2:], source_tokens[1])
            alias_index = len(alias_segments) - 1
            if 0 <= alias_index < len(source_norms):
                source_norms[alias_index] = reconcile.area_norm(areas[original_id][1]).replace(" ", "")
                if alias.get("original_parent_preserved", "").casefold() == "true":
                    source_norms = source_norms[alias_index:]
                    source_segments = source_segments[alias_index:]
            break
        anchor_norm = reconcile.area_norm(areas[anchor][1]).replace(" ", "")
        anchor_positions = [index for index, value in enumerate(source_norms)
                            if value == anchor_norm]
        if not anchor_positions:
            continue
        source_ancestors = list(zip(source_segments[:anchor_positions[-1]],
                                    source_norms[:anchor_positions[-1]]))
        mapped_ancestors = [areas[ident][1] for ident in path(anchor)[3:-1]]
        mapped_norms = [reconcile.area_norm(value).replace(" ", "")
                        for value in mapped_ancestors]
        missing = []
        cursor = 0
        for value, normalized in source_ancestors:
            next_index = next((index for index in range(cursor, len(mapped_norms))
                               if mapped_norms[index] == normalized), None)
            if next_index is None:
                missing.append(value)
            else:
                cursor = next_index + 1
        if not missing:
            continue
        counts = counts_by_source_path[source_path]
        missing_parent_rows.append({
            "openbeta_path": source_path, "original_anchor_id": anchor,
            "original_anchor_path": names(anchor),
            "missing_source_parents": " > ".join(missing),
            "new_source_uuids": counts["new"], "matched_source_uuids": counts["matched"],
            "review_source_uuids": counts["review"], "area_quality": quality,
        })
    missing_parent_rows.sort(key=lambda row: (-(row["new_source_uuids"] + row["matched_source_uuids"]),
                                              row["openbeta_path"]))
    write_csv(output / "audit-missing-source-parents.csv", missing_parent_rows,
              ("openbeta_path", "original_anchor_id", "original_anchor_path",
               "missing_source_parents", "new_source_uuids", "matched_source_uuids",
               "review_source_uuids", "area_quality"))
    missing_parent_groups: dict[tuple[int, str], dict] = {}
    for row in missing_parent_rows:
        key = (row["original_anchor_id"], row["missing_source_parents"])
        if key not in missing_parent_groups:
            missing_parent_groups[key] = {
                "original_anchor_id": key[0],
                "original_anchor_path": row["original_anchor_path"],
                "missing_source_parents": key[1],
                "source_paths": 0, "new_source_uuids": 0,
                "matched_source_uuids": 0, "review_source_uuids": 0,
                "example_openbeta_path": row["openbeta_path"],
            }
        group = missing_parent_groups[key]
        group["source_paths"] += 1
        for field in ("new_source_uuids", "matched_source_uuids", "review_source_uuids"):
            group[field] += row[field]
    grouped_missing_parents = sorted(
        missing_parent_groups.values(),
        key=lambda row: (-(row["new_source_uuids"] + row["matched_source_uuids"]),
                         row["original_anchor_path"]),
    )
    group_columns = ("original_anchor_id", "original_anchor_path", "missing_source_parents",
                     "source_paths", "new_source_uuids", "matched_source_uuids",
                     "review_source_uuids", "example_openbeta_path")
    write_csv(output / "audit-missing-source-parent-groups.csv", grouped_missing_parents,
              group_columns)
    priority_missing_parents = [row for row in grouped_missing_parents
                                if row["new_source_uuids"] >= 50
                                or row["matched_source_uuids"] >= 20]
    write_csv(output / "audit-missing-source-parent-priority.csv", priority_missing_parents,
              group_columns)
    reviewed_priority_rows = (list(csv.DictReader(priority_decisions.open()))
                              if priority_decisions else [])
    reviewed_priority = {
        (int(row["original_anchor_id"]), row["missing_source_parents"]): row
        for row in reviewed_priority_rows
    }
    if len(reviewed_priority) != len(reviewed_priority_rows):
        raise ValueError("Priority parent review repeats an area and source prefix")
    classified_priority = []
    for row in priority_missing_parents:
        decision = reviewed_priority.get((row["original_anchor_id"], row["missing_source_parents"]))
        classified_priority.append(row | {
            "verdict": decision["verdict"] if decision else "",
            "explanation": decision["explanation"] if decision else "",
            "evidence_url": decision["evidence_url"] if decision else "",
        })
    write_csv(output / "audit-missing-source-parent-priority-reviewed.csv",
              classified_priority, group_columns + ("verdict", "explanation", "evidence_url"))

    trusted: dict[int, list[tuple[str, tuple[float, float]]]] = defaultdict(list)
    by_source_path: dict[str, list[tuple]] = defaultdict(list)
    for row in rows:
        by_source_path[row[2]].append(row)
        if row[7] != "matched" or row[8] not in climb_areas:
            continue
        point = (row[5], row[6])
        for ancestor in path(climb_areas[row[8]]):
            trusted[ancestor].append((row[2], point))
    gps_conflicts = []
    for source_path, source_rows in by_source_path.items():
        mapped = source_rows[0][9]
        if mapped is None or mapped > base_area_max:
            continue
        new_rows = [row for row in source_rows if row[7] == "new"]
        if not new_rows:
            continue
        references = [point for other_path, point in trusted[mapped] if other_path != source_path]
        if len(references) < 2:
            continue
        points = {(row[5], row[6]) for row in new_rows}
        nearest = min(km(point, reference) for point in points for reference in references)
        if nearest <= 50:
            continue
        gps_conflicts.append({
            "openbeta_path": source_path, "mapped_area_id": mapped,
            "mapped_area_path": names(mapped), "new_source_uuids": len(new_rows),
            "nearest_trusted_route_km": round(nearest, 1),
            "trusted_route_points": len(references),
        })
    gps_conflicts.sort(key=lambda row: (-row["new_source_uuids"], row["openbeta_path"]))
    write_csv(output / "audit-gps-discordant-areas.csv", gps_conflicts,
              ("openbeta_path", "mapped_area_id", "mapped_area_path", "new_source_uuids",
               "nearest_trusted_route_km", "trusted_route_points"))

    descendant_gps_conflicts = []
    for source_path, source_rows in by_source_path.items():
        mapped = source_rows[0][9]
        if mapped is None or mapped <= base_area_max:
            continue
        original_anchors = [ident for ident in path(mapped)
                            if ident <= base_area_max and len(path(ident)) >= 4]
        if not original_anchors:
            continue
        anchor = original_anchors[-1]
        new_rows = [row for row in source_rows if row[7] == "new"]
        if not new_rows:
            continue
        references = [point for other_path, point in trusted[anchor]
                      if other_path != source_path]
        if len(references) < 2:
            continue
        points = {(row[5], row[6]) for row in new_rows}
        nearest = min(km(point, reference) for point in points for reference in references)
        if nearest <= 50:
            continue
        descendant_gps_conflicts.append({
            "openbeta_path": source_path, "mapped_area_id": mapped,
            "mapped_area_path": names(mapped), "original_anchor_id": anchor,
            "original_anchor_path": names(anchor), "new_source_uuids": len(new_rows),
            "nearest_trusted_route_km": round(nearest, 1),
            "trusted_route_points": len(references),
        })
    descendant_gps_conflicts.sort(key=lambda row: (-row["new_source_uuids"], row["openbeta_path"]))
    write_csv(output / "audit-gps-discordant-descendants.csv", descendant_gps_conflicts,
              ("openbeta_path", "mapped_area_id", "mapped_area_path",
               "original_anchor_id", "original_anchor_path", "new_source_uuids",
               "nearest_trusted_route_km", "trusted_route_points"))

    held_conflict_path = manifest_path.parent / "route_evidence_area_conflicts.csv"
    held_conflicts = list(csv.DictReader(held_conflict_path.open())) if held_conflict_path.exists() else []
    corrected_held_paths = sum(
        db.execute("SELECT quality FROM catalog_area_sources WHERE source='openbeta' "
                   "AND source_path=?", (row["openbeta_path"],)).fetchone()
        == ("reviewed_area_identity",) for row in held_conflicts)

    validation = {
        "source_status": dict(status_counts),
        "new_climbs_without_grade": db.execute(
            "SELECT COUNT(*) FROM climbs WHERE id>? AND grade IS NULL",
            (base_climb_max,)).fetchone()[0],
        "unrelated_matched_routes": sum(len(items) for items in matched_unrelated.values()),
        "unrelated_matched_source_paths": len(matched_unrelated),
        "held_area_conflict_paths": len(held_conflicts),
        "held_area_conflict_crosswalks_corrected": corrected_held_paths,
        "held_area_conflict_new_routes": sum(int(row["held_new_routes"]) for row in held_conflicts),
        "accepted_route_links_in_held_area_conflicts": sum(
            int(row["unrelated_matched_routes"]) for row in held_conflicts),
        "new_original_exact_candidate_pairs": len(exact_overlaps),
        "reviewed_geographic_new_original_pairs": sum(row["reviewed_geographic_exception"]
                                                     for row in exact_overlaps),
        "unreviewed_new_original_exact_candidate_pairs": sum(
            not row["reviewed_geographic_exception"] for row in exact_overlaps),
        "original_climb_overlap_candidate_pairs": len(original_duplicate_candidates),
        "original_generated_same_name_sibling_groups": len(duplicate_areas),
        "original_original_same_name_sibling_groups": len(original_siblings),
        "source_prefix_ancestry_review_paths": len(ancestry_conflicts),
        "source_prefix_ancestry_new_source_uuids": sum(row["new_source_uuids"] for row in ancestry_conflicts),
        "missing_source_parent_paths": len(missing_parent_rows),
        "missing_source_parent_new_source_uuids": sum(row["new_source_uuids"] for row in missing_parent_rows),
        "missing_source_parent_groups": len(grouped_missing_parents),
        "missing_source_parent_priority_groups": len(priority_missing_parents),
        "missing_source_parent_priority_unclassified": sum(
            not row["verdict"] for row in classified_priority),
        "priority_parent_decisions_sha256": (hashlib.sha256(priority_decisions.read_bytes()).hexdigest()
                                             if priority_decisions else None),
        "reviewed_route_geography_exceptions": len(observed_exceptions),
        "reviewed_route_geography_exceptions_sha256": (
            hashlib.sha256(route_exceptions.read_bytes()).hexdigest() if route_exceptions else None),
        "gps_discordant_existing_area_paths_over_50km": len(gps_conflicts),
        "gps_discordant_new_source_uuids": sum(row["new_source_uuids"] for row in gps_conflicts),
        "gps_discordant_generated_descendant_paths_over_50km": len(descendant_gps_conflicts),
        "gps_discordant_generated_descendant_new_uuids": sum(
            row["new_source_uuids"] for row in descendant_gps_conflicts),
        "foreign_key_errors": db.execute("PRAGMA foreign_key_check").fetchall(),
        "integrity": db.execute("PRAGMA integrity_check").fetchone()[0],
    }
    (output / "audit-post-import.json").write_text(json.dumps(validation, indent=2) + "\n")
    if (validation["foreign_key_errors"] or validation["integrity"] != "ok"
            or validation["new_climbs_without_grade"]
            or priority_decisions and validation["missing_source_parent_priority_unclassified"]):
        raise ValueError("Preview failed SQLite integrity validation")
    return validation


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--priority-decisions", type=Path)
    parser.add_argument("--route-exceptions", type=Path)
    args = parser.parse_args()
    print(json.dumps(audit(args.database, args.manifest, args.output,
                           args.priority_decisions, args.route_exceptions), indent=2))
