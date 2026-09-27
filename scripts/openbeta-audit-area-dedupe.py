#!/usr/bin/env python3
"""Find duplicate area candidates across the entire reconciled catalog.

This is a candidate generator, not an automatic merge policy. A shared area
label can describe different climbing disciplines or different crags; route
overlap and the full hierarchy are included so a reviewer can decide.
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
import re
import sqlite3
import statistics
import sys
from collections import Counter, defaultdict
from itertools import combinations
from pathlib import Path

from rapidfuzz.fuzz import ratio


SCRIPT = Path(__file__).with_name("openbeta-reconcile.py")
spec = importlib.util.spec_from_file_location("openbeta_reconcile_area_audit", SCRIPT)
assert spec and spec.loader
reconcile = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = reconcile
spec.loader.exec_module(reconcile)


def candidates(database: Path, original_area_max: int, original_climb_max: int
               ) -> tuple[list[dict], list[dict], dict]:
    db = sqlite3.connect(database)
    areas = {ident: (parent, name) for ident, parent, name in
             db.execute("SELECT id,parent_id,name FROM areas")}
    unknown_roots = {ident for ident, (parent, name) in areas.items()
                     if name == "Unknown" and parent in areas
                     and areas[parent][1] == "Uncategorized"}
    children: dict[int | None, list[int]] = defaultdict(list)
    for ident, (parent, _) in areas.items():
        children[parent].append(ident)
    paths: dict[int, tuple[int, ...]] = {}

    def path(area_id: int) -> tuple[int, ...]:
        if area_id not in paths:
            parent = areas[area_id][0]
            paths[area_id] = (path(parent) if parent else ()) + (area_id,)
        return paths[area_id]

    def full_name(area_id: int) -> str:
        return " > ".join(areas[ident][1] for ident in path(area_id))

    def key(area_id: int) -> str:
        return reconcile.area_norm(areas[area_id][1]).replace(" ", "")

    def alias_key(area_id: int) -> str:
        """Candidate retrieval only: remove a trailing source alias or activity label."""
        name = areas[area_id][1].strip()
        name = re.sub(r"\s*\((?:boulders|routes)\)(?=,\s*the$|$)", "", name,
                      flags=re.I)
        name = re.sub(r"\s*\([^()]+\)\s*$", "", name)
        name = re.sub(
            r"\s+(?:bouldering|rock climbing|sport and traditional climbing|"
            r"sport climbing|trad climbing|routes|rock climbs)$", "", name,
            flags=re.I)
        return reconcile.area_norm(name).replace(" ", "")

    # Every area is considered. The blocking key limits fuzzy comparisons
    # under enormous parents such as Uncategorized > Unknown.
    flags: dict[tuple[int, int], set[str]] = defaultdict(set)
    for parent, ids in children.items():
        exact: dict[str, list[int]] = defaultdict(list)
        blocks: dict[str, list[int]] = defaultdict(list)
        aliases: dict[str, list[int]] = defaultdict(list)
        for area_id in ids:
            normalized = key(area_id)
            if normalized:
                exact[normalized].append(area_id)
                if len(normalized) >= 6:
                    blocks[normalized[:5]].append(area_id)
            if len(alias_key(area_id)) >= 6:
                aliases[alias_key(area_id)].append(area_id)
        for group in exact.values():
            for first, second in combinations(sorted(group), 2):
                flags[first, second].add("same_parent_equivalent_name")
        for group in blocks.values():
            for first, second in combinations(sorted(group), 2):
                if key(first) != key(second) and ratio(key(first), key(second)) >= 88:
                    flags[first, second].add("same_parent_near_name")
        for group in aliases.values():
            for first, second in combinations(sorted(group), 2):
                if key(first) != key(second):
                    flags[first, second].add("same_parent_alias_name")
    for area_id, (parent, _) in areas.items():
        if parent and key(area_id) and key(area_id) == key(parent):
            flags[tuple(sorted((parent, area_id)))].add("repeated_parent_child_name")
        elif parent and len(alias_key(area_id)) >= 6 \
                and alias_key(area_id) == alias_key(parent):
            flags[tuple(sorted((parent, area_id)))].add("parent_child_alias_name")

    # Direct-climb evidence finds duplicate areas on separate branches. Only
    # same country/state anchors are compared. A single generic route name is
    # never enough to propose an area merge.
    route_index: dict[tuple[int, str, str, str], list[tuple[int, int, str]]] = defaultdict(list)
    unknown_original_routes: list[tuple[int, int, str, str, str]] = []
    known_catalog_routes: dict[tuple[str, str, str], list[tuple[int, int]]] = defaultdict(list)
    direct_counts: Counter[int] = Counter()
    original_direct_counts: Counter[int] = Counter()
    for area_id, name, climb_type, grade, climb_id in db.execute(
            "SELECT area_id,name,type,grade,id FROM climbs WHERE grade IS NOT NULL"):
        direct_counts[area_id] += 1
        if climb_id <= original_climb_max:
            original_direct_counts[area_id] += 1
        if reconcile.is_unnamed_climb(name):
            continue
        core, variant = reconcile.name_parts(name)
        if not core or len(core) < 4:
            continue
        ancestry = path(area_id)
        anchor = ancestry[2] if len(ancestry) > 2 else ancestry[-1]
        route_index[anchor, climb_type, core, variant].append((area_id, grade, name))
        if any(root in ancestry for root in unknown_roots):
            if climb_id <= original_climb_max:
                unknown_original_routes.append((area_id, grade, climb_type, core, variant))
        else:
            known_catalog_routes[climb_type, core, variant].append((area_id, grade))
    route_matches: dict[tuple[int, int], set[str]] = defaultdict(set)
    for (_, _, core, variant), entries in route_index.items():
        if len(entries) > 24:
            continue
        for first, second in combinations(entries, 2):
            first_area, first_grade, first_name = first
            second_area, second_grade, _ = second
            if first_area == second_area or abs(first_grade - second_grade) > 1:
                continue
            first_path, second_path = path(first_area), path(second_area)
            if first_area in second_path or second_area in first_path:
                continue
            pair = tuple(sorted((first_area, second_area)))
            route_matches[pair].add(core + ("/" + variant if variant else ""))
    for pair, names in route_matches.items():
        if len(names) >= 2:
            flags[pair].add("cross_branch_route_overlap")

    # Uncategorized > Unknown has no usable geographic anchor. Distinctive
    # route overlap plus a similar area name can identify a misplaced original
    # crag elsewhere in the catalog, such as Flock Hill or Millennium Boulder.
    unknown_pairs: dict[tuple[int, int], set[str]] = defaultdict(set)
    for area_id, grade, climb_type, core, variant in unknown_original_routes:
        for known_area, known_grade in known_catalog_routes[climb_type, core, variant]:
            if abs(grade - known_grade) > 1:
                continue
            pair = tuple(sorted((area_id, known_area)))
            unknown_pairs[pair].add(core)
    for pair, names in unknown_pairs.items():
        first, second = pair
        first_key, second_key = key(first), key(second)
        similarly_named = (ratio(first_key, second_key) >= 75
                           or len(first_key) >= 6 and first_key in second_key
                           or len(second_key) >= 6 and second_key in first_key)
        if len(names) >= 2 or similarly_named:
            flags[pair].add("unknown_to_geographic_route_evidence")
            route_matches[pair].update(names)

    known_by_area_name: dict[str, list[int]] = defaultdict(list)
    unknown_by_area_name: dict[str, list[int]] = defaultdict(list)
    for area_id in areas:
        normalized = key(area_id)
        if len(normalized) < 8:
            continue
        ancestry = path(area_id)
        if any(root in ancestry for root in unknown_roots):
            if area_id not in unknown_roots and direct_counts[area_id]:
                unknown_by_area_name[normalized].append(area_id)
        elif area_id <= original_area_max:
            known_by_area_name[normalized].append(area_id)
    for normalized, unknown_ids in unknown_by_area_name.items():
        known_ids = known_by_area_name.get(normalized, [])
        if len(known_ids) > 4 or len(unknown_ids) > 8:
            continue
        for first in unknown_ids:
            for second in known_ids:
                flags[tuple(sorted((first, second)))].add("unknown_to_geographic_name_only")

    source_points: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for area_id, latitude, longitude in db.execute(
            "SELECT c.area_id,r.latitude,r.longitude FROM catalog_route_sources r "
            "JOIN climbs c ON c.id=r.climb_id WHERE r.status IN ('matched','new') "
            "AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL"):
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            source_points[area_id].append((latitude, longitude))
    centers = {area_id: (statistics.median(point[0] for point in points),
                         statistics.median(point[1] for point in points))
               for area_id, points in source_points.items()}

    def distance_km(first: int, second: int) -> float | None:
        if first not in centers or second not in centers:
            return None
        lat1, lon1 = map(math.radians, centers[first])
        lat2, lon2 = map(math.radians, centers[second])
        value = (math.sin((lat2 - lat1) / 2) ** 2
                 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
        return 12742 * math.asin(min(1, math.sqrt(value)))

    # Same-named areas on parallel branches may have no shared direct route
    # because one source organized its climbs into deeper children. Nearby
    # source GPS makes these worth review even when neither branch is a sibling.
    by_anchor_name: dict[tuple[int, str], list[int]] = defaultdict(list)
    for area_id in areas:
        normalized = key(area_id)
        if len(normalized) < 6:
            continue
        ancestry = path(area_id)
        anchor = ancestry[2] if len(ancestry) > 2 else ancestry[-1]
        by_anchor_name[anchor, normalized].append(area_id)
    for group in by_anchor_name.values():
        if len(group) > 24:
            continue
        for first, second in combinations(sorted(group), 2):
            if first in path(second) or second in path(first):
                continue
            flags[first, second].add("parallel_equivalent_name")
            distance = distance_km(first, second)
            if distance is not None and distance <= 5:
                flags[first, second].add("same_name_nearby_parallel_branches")

    # Build evidence over whole subtrees for every candidate. A geographic
    # heading can have no direct routes or GPS while all of its children do.
    candidate_ids = {ident for pair in flags for ident in pair}
    subtree_counts: Counter[int] = Counter()
    subtree_signatures: dict[int, set[tuple[str, str, str, int]]] = defaultdict(set)
    for area_id, name, climb_type, grade in db.execute(
            "SELECT area_id,name,type,grade FROM climbs WHERE grade IS NOT NULL"):
        core, variant = ("", "") if reconcile.is_unnamed_climb(name) else reconcile.name_parts(name)
        for ancestor in path(area_id):
            if ancestor in candidate_ids:
                subtree_counts[ancestor] += 1
                if core and len(core) >= 4:
                    subtree_signatures[ancestor].add((climb_type, core, variant, grade))
    subtree_points: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for area_id, points in source_points.items():
        for ancestor in path(area_id):
            if ancestor in candidate_ids:
                subtree_points[ancestor].extend(points)
    subtree_centers = {
        area_id: (statistics.median(point[0] for point in points),
                  statistics.median(point[1] for point in points))
        for area_id, points in subtree_points.items()
    }

    def subtree_distance_km(first: int, second: int) -> float | None:
        if first not in subtree_centers or second not in subtree_centers:
            return None
        lat1, lon1 = map(math.radians, subtree_centers[first])
        lat2, lon2 = map(math.radians, subtree_centers[second])
        value = (math.sin((lat2 - lat1) / 2) ** 2
                 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
        return 12742 * math.asin(min(1, math.sqrt(value)))

    subtree_overlaps: dict[tuple[int, int], set[str]] = {}
    for pair, reasons in flags.items():
        if not reasons.intersection({"parallel_equivalent_name", "same_parent_alias_name"}):
            continue
        first, second = pair
        smaller, larger = sorted((subtree_signatures[first], subtree_signatures[second]),
                                 key=len)
        shared = {core + ("/" + variant if variant else "")
                  for climb_type, core, variant, grade in smaller
                  if any((climb_type, core, variant, grade + delta) in larger
                         for delta in (-1, 0, 1))}
        if shared:
            subtree_overlaps[pair] = shared
            reasons.add("parallel_subtree_route_overlap")
        distance = subtree_distance_km(first, second)
        if distance is not None and distance <= 5:
            reasons.add("parallel_subtree_gps_nearby")

    rows = []
    for (first, second), reasons in flags.items():
        overlaps = sorted(route_matches.get((first, second), set()))
        subtree_shared = sorted(subtree_overlaps.get((first, second), set()))
        first_path, second_path = path(first), path(second)
        common = 0
        for left, right in zip(first_path, second_path):
            if left != right:
                break
            common += 1
        rows.append({
            "first_area_id": first, "first_area_path": full_name(first),
            "first_kind": "original" if first <= original_area_max else "imported",
            "first_direct_climbs": direct_counts[first],
            "first_original_climbs": original_direct_counts[first],
            "first_child_areas": len(children[first]),
            "first_linked_gps_points": len(source_points[first]),
            "first_subtree_climbs": subtree_counts[first],
            "first_subtree_gps_points": len(subtree_points[first]),
            "second_area_id": second, "second_area_path": full_name(second),
            "second_kind": "original" if second <= original_area_max else "imported",
            "second_direct_climbs": direct_counts[second],
            "second_original_climbs": original_direct_counts[second],
            "second_child_areas": len(children[second]),
            "second_linked_gps_points": len(source_points[second]),
            "second_subtree_climbs": subtree_counts[second],
            "second_subtree_gps_points": len(subtree_points[second]),
            "source_centroid_distance_km": (f"{distance_km(first, second):.1f}"
                                            if distance_km(first, second) is not None else ""),
            "source_subtree_centroid_distance_km": (
                f"{subtree_distance_km(first, second):.3f}"
                if subtree_distance_km(first, second) is not None else ""),
            "common_ancestor_depth": common,
            "shared_route_names": len(overlaps),
            "shared_route_examples": "; ".join(overlaps[:8]),
            "shared_subtree_route_names": len(subtree_shared),
            "shared_subtree_route_examples": "; ".join(subtree_shared[:8]),
            "signals": "; ".join(sorted(reasons)),
        })
    rows.sort(key=lambda row: (
        -("same_parent_equivalent_name" in row["signals"]),
        -row["shared_route_names"],
        row["first_area_path"], row["second_area_path"],
    ))
    source_links = Counter({climb_id: count for climb_id, count in db.execute(
        "SELECT climb_id,COUNT(*) FROM catalog_route_sources WHERE climb_id IS NOT NULL GROUP BY climb_id")})
    routes_by_place: dict[tuple[int, str, str, str], list[tuple]] = defaultdict(list)
    for climb_id, area_id, name, climb_type, grade, sends in db.execute(
            "SELECT id,area_id,name,type,grade,send_count FROM climbs WHERE grade IS NOT NULL"):
        if reconcile.is_unnamed_climb(name):
            continue
        core, variant = reconcile.name_parts(name)
        routes_by_place[area_id, climb_type, core, variant].append(
            (climb_id, name, grade, sends))
    collocated_climbs = []
    for (area_id, climb_type, core, variant), group in routes_by_place.items():
        if len(group) < 2:
            continue
        for first, second in combinations(group, 2):
            if abs(first[2] - second[2]) > 1:
                continue
            collocated_climbs.append({
                "area_id": area_id, "area_path": full_name(area_id),
                "normalized_name": core, "start_variant": variant, "type": climb_type,
                "first_climb_id": first[0], "first_name": first[1],
                "first_grade_ordinal": first[2], "first_send_count": first[3],
                "first_openbeta_links": source_links[first[0]],
                "second_climb_id": second[0], "second_name": second[1],
                "second_grade_ordinal": second[2], "second_send_count": second[3],
                "second_openbeta_links": source_links[second[0]],
                "pair_kind": ("original_original" if first[0] <= original_climb_max
                              and second[0] <= original_climb_max else "imported_involved"),
            })
    collocated_climbs.sort(key=lambda row: (row["area_path"], row["normalized_name"],
                                             row["first_climb_id"]))
    summary = {
        "areas_scanned": len(areas),
        "original_areas_scanned": sum(ident <= original_area_max for ident in areas),
        "climbs_scanned": sum(direct_counts.values()),
        "uncategorized_unknown_direct_child_areas": sum(
            len(children[root]) for root in unknown_roots),
        "uncategorized_unknown_direct_climbs": sum(
            direct_counts[child] for root in unknown_roots for child in children[root]),
        "candidate_pairs": len(rows),
        "signals": dict(Counter(signal for reasons in flags.values() for signal in reasons)),
        "original_original_candidate_pairs": sum(
            row["first_kind"] == row["second_kind"] == "original" for row in rows),
        "imported_candidate_pairs": sum(
            "imported" in (row["first_kind"], row["second_kind"]) for row in rows),
        "same_area_near_grade_climb_pairs": len(collocated_climbs),
        "same_area_original_climb_pairs": sum(
            row["pair_kind"] == "original_original" for row in collocated_climbs),
    }
    db.close()
    return rows, collocated_climbs, summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--reviewed-holds", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    rows, collocated_climbs, result = candidates(args.database, manifest["existing_area_max_id"],
                                                  manifest["existing_climb_max_id"])
    holds = {}
    if args.reviewed_holds:
        for row in csv.DictReader(args.reviewed_holds.open()):
            pair = tuple(sorted((int(row["first_area_id"]), int(row["second_area_id"]))))
            if pair in holds or row["verdict"] not in {
                    "distinct_areas", "legitimate_parent_child", "route_overlap_only",
                    "needs_geography"}:
                raise ValueError(f"Invalid or repeated area audit hold: {pair}")
            holds[pair] = row
    present_holds = set()
    high_priority_unreviewed = 0
    semantic_priority_rows = []
    for row in rows:
        pair = (row["first_area_id"], row["second_area_id"])
        hold = holds.get(pair)
        row["review_status"] = hold["verdict"] if hold else "unreviewed"
        row["review_note"] = hold["reason"] if hold else ""
        row["review_evidence_url"] = hold["evidence_url"] if hold else ""
        if hold:
            present_holds.add(pair)
        elif ("same_parent_equivalent_name" in row["signals"]
              or row["shared_route_names"] >= 3
              or "unknown_to_geographic_route_evidence" in row["signals"]
              and row["shared_route_names"] >= 2):
            high_priority_unreviewed += 1
        impact = row["first_subtree_climbs"] + row["second_subtree_climbs"]
        minimum_subtree = min(row["first_subtree_climbs"], row["second_subtree_climbs"])
        regional = row["common_ancestor_depth"] >= 4
        subtree_distance = (float(row["source_subtree_centroid_distance_km"])
                            if row["source_subtree_centroid_distance_km"] else None)
        semantic_priority = (
            "same_parent_alias_name" in row["signals"] and impact >= 20
            or "parent_child_alias_name" in row["signals"] and impact >= 20
            or "parallel_subtree_route_overlap" in row["signals"]
            or "parallel_subtree_gps_nearby" in row["signals"]
            and subtree_distance is not None and subtree_distance <= 0.5
            and impact >= 10
            or "parallel_equivalent_name" in row["signals"] and regional
            and minimum_subtree >= 2 and impact >= 30
        )
        row["semantic_priority"] = "yes" if semantic_priority else ""
        if semantic_priority and row["review_status"] == "unreviewed":
            semantic_priority_rows.append(row)
    result["reviewed_merges_applied"] = manifest.get("reviewed_original_area_merges_applied", 0)
    result["reviewed_holds"] = len(present_holds)
    result["unreviewed_high_priority"] = high_priority_unreviewed
    result["unreviewed_semantic_priority"] = len(semantic_priority_rows)
    result["reviewed_needs_geography"] = sum(
        row["review_status"] == "needs_geography" for row in rows)
    result["unreviewed_nearby_parallel_branches"] = sum(
        row["review_status"] == "unreviewed"
        and "same_name_nearby_parallel_branches" in row["signals"] for row in rows)
    result["unreviewed_near_name_within_250m"] = sum(
        row["review_status"] == "unreviewed"
        and "same_parent_near_name" in row["signals"]
        and bool(row["source_centroid_distance_km"])
        and float(row["source_centroid_distance_km"]) <= 0.25 for row in rows)
    result["reviewed_holds_no_longer_candidates"] = len(holds) - len(present_holds)
    args.output.mkdir(parents=True, exist_ok=True)
    if args.reviewed_holds:
        (args.output / "reviewed_area_dedupe_holds.csv").write_bytes(
            args.reviewed_holds.read_bytes())
    semantic_priority_rows.sort(key=lambda row: (
        -(row["first_subtree_climbs"] + row["second_subtree_climbs"]),
        row["first_area_id"], row["second_area_id"]))
    with (args.output / "audit-area-dedupe-candidates.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    with (args.output / "audit-area-semantic-priority.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, rows[0].keys())
        writer.writeheader()
        writer.writerows(semantic_priority_rows)
    with (args.output / "audit-collocated-climb-candidates.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, collocated_climbs[0].keys() if collocated_climbs else (
            "area_id", "area_path", "normalized_name", "start_variant", "type",
            "first_climb_id", "first_name", "first_grade_ordinal", "first_send_count",
            "first_openbeta_links", "second_climb_id", "second_name", "second_grade_ordinal",
            "second_send_count", "second_openbeta_links", "pair_kind"))
        writer.writeheader()
        writer.writerows(collocated_climbs)
    # One row per surviving node makes the coverage and remaining review load
    # visible without conflating "scanned" with "semantically verified".
    db = sqlite3.connect(args.database)
    all_areas = {ident: (parent, name) for ident, parent, name in
                 db.execute("SELECT id,parent_id,name FROM areas")}
    direct = Counter(dict(db.execute("SELECT area_id,COUNT(*) FROM climbs GROUP BY area_id")))
    gps = Counter(dict(db.execute(
        "SELECT c.area_id,COUNT(*) FROM catalog_route_sources r "
        "JOIN climbs c ON c.id=r.climb_id WHERE r.latitude IS NOT NULL "
        "AND r.longitude IS NOT NULL AND r.status IN ('matched','new') "
        "GROUP BY c.area_id")))
    area_sources = Counter(dict(db.execute(
        "SELECT area_id,COUNT(*) FROM catalog_area_sources "
        "WHERE area_id IS NOT NULL GROUP BY area_id")))
    all_paths: dict[int, tuple[int, ...]] = {}

    def area_path(area_id: int) -> tuple[int, ...]:
        if area_id not in all_paths:
            parent = all_areas[area_id][0]
            all_paths[area_id] = (area_path(parent) if parent else ()) + (area_id,)
        return all_paths[area_id]

    subtree = Counter(direct)
    subtree_gps = Counter(gps)
    child_counts: Counter[int] = Counter()
    for area_id in sorted(all_areas, key=lambda ident: len(area_path(ident)), reverse=True):
        parent = all_areas[area_id][0]
        if parent:
            subtree[parent] += subtree[area_id]
            subtree_gps[parent] += subtree_gps[area_id]
            child_counts[parent] += 1
    pairs_by_area: Counter[int] = Counter()
    unresolved_by_area: Counter[int] = Counter()
    priority_by_area: Counter[int] = Counter()
    for row in rows:
        for area_id in (row["first_area_id"], row["second_area_id"]):
            pairs_by_area[area_id] += 1
            if row["review_status"] in {"unreviewed", "needs_geography"}:
                unresolved_by_area[area_id] += 1
            if row["semantic_priority"] and row["review_status"] == "unreviewed":
                priority_by_area[area_id] += 1
    inventory_fields = (
        "area_id", "area_path", "kind", "direct_climbs", "subtree_climbs",
        "direct_child_areas", "direct_source_gps_points", "subtree_source_gps_points",
        "source_area_crosswalks", "candidate_pairs", "unresolved_candidate_pairs",
        "unreviewed_semantic_priority_pairs")
    with (args.output / "audit-area-inventory.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, inventory_fields)
        writer.writeheader()
        for area_id in sorted(all_areas):
            writer.writerow({
                "area_id": area_id,
                "area_path": " > ".join(all_areas[ancestor][1]
                                        for ancestor in area_path(area_id)),
                "kind": "original" if area_id <= manifest["existing_area_max_id"] else "imported",
                "direct_climbs": direct[area_id],
                "subtree_climbs": subtree[area_id],
                "direct_child_areas": child_counts[area_id],
                "direct_source_gps_points": gps[area_id],
                "subtree_source_gps_points": subtree_gps[area_id],
                "source_area_crosswalks": area_sources[area_id],
                "candidate_pairs": pairs_by_area[area_id],
                "unresolved_candidate_pairs": unresolved_by_area[area_id],
                "unreviewed_semantic_priority_pairs": priority_by_area[area_id],
            })
    activity_rows = []
    for area_id, (parent, name) in all_areas.items():
        if (re.search(r"\b(?:routes|bouldering|rock climbing|"
                      r"sport and traditional climbing|climbing)$", name, re.I)
                and not re.search(r"\bno climbing$", name, re.I)):
            activity_rows.append({
                "area_id": area_id,
                "area_path": " > ".join(all_areas[ancestor][1]
                                        for ancestor in area_path(area_id)),
                "parent_area_id": parent or "",
                "parent_name": all_areas[parent][1] if parent else "",
                "direct_climbs": direct[area_id],
                "subtree_climbs": subtree[area_id],
                "direct_child_areas": child_counts[area_id],
                "source_area_crosswalks": area_sources[area_id],
                "candidate_pairs": pairs_by_area[area_id],
            })
    activity_rows.sort(key=lambda row: (-row["subtree_climbs"], row["area_path"]))
    with (args.output / "audit-activity-heading-areas.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, activity_rows[0].keys() if activity_rows else (
            "area_id", "area_path", "parent_area_id", "parent_name",
            "direct_climbs", "subtree_climbs", "direct_child_areas",
            "source_area_crosswalks", "candidate_pairs"))
        writer.writeheader()
        writer.writerows(activity_rows)
    result["areas_without_candidate_signal"] = sum(
        not pairs_by_area[area_id] for area_id in all_areas)
    result["areas_with_unresolved_candidate_signal"] = sum(
        bool(unresolved_by_area[area_id]) for area_id in all_areas)
    result["activity_heading_areas"] = len(activity_rows)
    result["activity_heading_direct_climbs"] = sum(row["direct_climbs"]
                                                   for row in activity_rows)
    (args.output / "audit-area-dedupe-summary.json").write_text(json.dumps(result, indent=2) + "\n")
    db.close()
    print(json.dumps(result, indent=2))
