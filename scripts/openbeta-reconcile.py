#!/usr/bin/env python3
"""Reconcile an OpenBeta parquet release with a Betabook catalog SQL dump.

Usage: python scripts/openbeta-reconcile.py --catalog-sql /path/database.sql \
  --parquet /path/openbeta-climbs.parquet --release v2026-09-13 \
  --output /path/import

Only the generated SQL changes a database. This program never contacts D1.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import sqlite3
import subprocess
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import duckdb
from rapidfuzz import distance, fuzz, process


BOULDER = ("VB",) + tuple(f"V{i}" for i in range(18))
ROPE = tuple(f"5.{i}" for i in range(10)) + tuple(
    f"5.{number}{letter}"
    for number in range(10, 16)
    for letter in "abcd"
)
GRADE_INDEX = {
    "boulder": {grade.casefold(): i for i, grade in enumerate(BOULDER)},
    "sport": {grade.casefold(): i for i, grade in enumerate(ROPE)},
    "trad": {grade.casefold(): i for i, grade in enumerate(ROPE)},
}
UNSPECIFIED_SOURCE_GRADES = {
    "", "?", "v?", "5.?", "unknown", "ungraded", "n/a", "na",
    "none", "not rated", "not graded",
}
COUNTRY_NAMES = {
    "USA": "United States",
    "Lao People's Democratic Republic": "Laos",
    "People's Republic of China": "China",
    "Vietnam": "Viet Nam",
    "Virgin Islands, U.S.": "United States",
}
STATE_NAMES = {
    ("Canada", "Newfoundland and Labrador"): "Newfoundland",
    ("Laos", "Thakhek"): "Thakhek (Green Climbers Home)",
}
COUNTRY_CONTINENTS = {
    "United States": "North America", "Canada": "North America",
    "Mexico": "North America", "Puerto Rico": "North America",
    "Greenland": "North America", "South Africa": "Africa",
    "Switzerland": "Europe", "France": "Europe", "Spain": "Europe",
    "Italy": "Europe", "Greece": "Europe", "Germany": "Europe",
    "New Zealand": "Oceania", "Australia": "Oceania",
    "Laos": "Asia", "Israel": "Asia", "Viet Nam": "Asia",
    "India": "Asia", "Thailand": "Asia", "China": "Asia",
    "Georgia": "Asia", "Brazil": "South America",
}
GENERIC_AREA_SUFFIX = re.compile(r"\s+(?:area|region|crags?|boulders?)$")
GENERIC_AREA_TOKEN = re.compile(
    r"^(?:main|east|west|north|south|lower|upper|left|right|central|middle|front|back)"
    r"(?:\s+(?:wall|face|cliff|crag|area|boulder|sector|side|slab|cave|end|ridge|arete))?$"
)
START_SUFFIX = re.compile(
    r"(?:[\s\-:]+[\(\[]?\s*|[\(\[]\s*)(d[eé]part[\s\-]*assis|assis|sit[\s\-]*start|sds|sit|low[\s\-]*start|low|stand[\s\-]*start|stand)\s*[\)\]]?\s*$",
    re.I,
)
START_PREFIX = re.compile(r"^(d[eé]part[\s\-]*assis|sit[\s\-]*start|sds|low[\s\-]*start|stand[\s\-]*start)\s*[:\-]\s*", re.I)
AKA_SUFFIX = re.compile(r"\s*\((?:aka|a\.k\.a\.)\s+([^)]*)\)\s*$", re.I)
SOURCE_ORDER_PREFIX = re.compile(r"^(?:\([a-z0-9]{1,2}\)|[a-z][.:]|\d{1,2}[.:])\s+", re.I)
UNNAMED_DESCRIPTORS = {
    "aka", "arete", "boulder", "bolted", "chimney", "climb", "corner",
    "crack", "dihedral", "face", "far", "finger", "hand", "handcrack",
    "left", "line", "name", "offwidth", "ow", "problem", "project",
    "right", "roof", "route", "sd", "sit", "slab", "sport", "trad",
    "tr", "traverse", "unnamed", "variation", "variant", "vertical",
    "wall", "wide",
}


def norm(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    text = text.casefold().replace("&", " and ").replace("’", "'")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def area_norm(value: str | None) -> str:
    result = GENERIC_AREA_SUFFIX.sub("", norm(value)).removeprefix("the ")
    return result.removesuffix(" the")


def source_area_segments(values: tuple[str, ...] | list[str], state: str = "") -> list[str]:
    """Turn OpenBeta activity headings into places, skipping redundant levels."""
    result = []
    ancestors = [state] if state else []
    for raw in values:
        if not raw:
            continue
        value = raw.strip().strip("*").strip()
        if not value:
            continue
        value = SOURCE_ORDER_PREFIX.sub("", value)
        value = value.rstrip(".").strip()
        value = re.sub(r"\s*\(bouldering only\)$", "", value, flags=re.I)
        parenthetical = re.fullmatch(r"(.+?)\s+bouldering\s+\(([^()]*)\)", value, re.I)
        if parenthetical and norm(parenthetical.group(2)) in norm(parenthetical.group(1)):
            value = parenthetical.group(1) + " Bouldering"
        original = value
        if (re.fullmatch(r"(?:new\s+)?bouldering(?:\s+areas?)?", value, re.I)
                or re.fullmatch(r"(?:[a-z]|\d{1,2})[.:]\s*bouldering", value, re.I)
                or re.match(r"\d{1,2}[.:]\s*bouldering areas?\b", value, re.I)):
            continue
        at_location = re.fullmatch(r"bouldering\s+(?:at|in|@)\s+(.+)", value, re.I)
        if not at_location:
            at_location = re.fullmatch(r"[a-z][.:]\s*bouldering\s+in\s+(?:the\s+)?(.+)", value, re.I)
        if not at_location:
            at_location = re.fullmatch(r"bouldering\s+((?:north|south|east|west|mid)[^,]+)", value, re.I)
        if not at_location:
            at_location = re.fullmatch(r"bouldering\s+((?!cave$|wall$|rock$|for\b)[a-z][^,]+)", value, re.I)
        if at_location:
            value = at_location.group(1).strip()
            if value.casefold().startswith("the "):
                value = value[4:]
        else:
            mixed_heading = re.fullmatch(r"(.+?)\s+bouldering and rock", value, re.I)
            if not mixed_heading:
                mixed_heading = re.fullmatch(r"(.+?)\s+bouldering and buildering", value, re.I)
            if not mixed_heading:
                mixed_heading = re.fullmatch(r"(.+?)\s+bouldering/(?:buildering|climbing)", value, re.I)
            if mixed_heading and len(mixed_heading.group(1).strip()) >= 4:
                value = mixed_heading.group(1).strip()
            for _ in range(2):
                suffix = re.fullmatch(r"(.+?)\s*(?:\(bouldering\)|\bbouldering(?:\s+(?:areas?|problems))?)", value, re.I)
                if not suffix:
                    break
                prefix = suffix.group(1).strip(" -(")
                if (len(prefix) < 2 or norm(prefix).split()[-1] in {"of", "and", "at", "the"}):
                    break
                value = prefix
        if norm(value) in {"bouldering", "new", "unknown"} or (len(value) <= 3 and value.isalpha() and value.isupper()):
            continue
        if value != original:
            normalized = area_norm(value).replace(" az", " arizona")
            equivalent = any(
                normalized == area_norm(ancestor).replace(" az", " arizona")
                or (len(normalized) >= 6 and (area_norm(ancestor).startswith(normalized + " ")
                                             or normalized in area_norm(ancestor)))
                for ancestor in ancestors
            )
            if equivalent:
                continue
        result.append(value)
        ancestors.append(value)
    return result


def canonical_state(country: str, state: str | None) -> str:
    return STATE_NAMES.get((country, state or ""), state or "")


def name_parts(value: str) -> tuple[str, str]:
    """Return (core name, start variant). Starts never cross-match."""
    text = value.strip()
    match = START_SUFFIX.search(text)
    if match and match.start() > 0:
        raw = match.group(1).casefold()
        text = text[: match.start()]
    else:
        match = START_PREFIX.match(text)
        if not match:
            return norm(text), "regular"
        raw = match.group(1).casefold()
        text = text[match.end() :]
    variant = "sit" if raw.startswith("sit") or raw == "sds" or "assis" in raw else "low" if raw.startswith("low") else "stand"
    return norm(text), variant


def is_unnamed_climb(value: str | None) -> bool:
    """Ignore source placeholders without dropping titled climbs like Unknown Pleasures."""
    raw = (value or "").strip()
    words = norm(raw).split()
    if not words or words[0] in {"unnamed", "untitled", "tbd", "na"}:
        return True
    if words[:2] == ["name", "unknown"]:
        return True
    if words[:2] == ["no", "name"]:
        return len(words) == 2 or words[2] in UNNAMED_DESCRIPTORS or words[2][0].isdigit()
    if re.fullmatch(r"(?:v(?:b|\d{1,2})|5\.\d{1,2}[abcd]?)[+\-]?", raw, re.I):
        return True
    if words[0] != "unknown":
        return False
    if len(words) == 1 or raw.casefold().startswith(("unknown/", "unknown-", "unknown(")):
        return True
    second = words[1]
    return (second in UNNAMED_DESCRIPTORS or second[0].isdigit()
            or bool(re.fullmatch(r"v\d{1,2}[a-z]?", second)))


def loose_core(core: str) -> str:
    words = core.removeprefix("the ").removesuffix(" the").split()
    return "".join(NUMBER_WORDS.get(word, word) for word in words if word != "and")


NUMBER_WORDS = {word: str(index) for index, word in enumerate(
    ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")
)}
NAME_QUALIFIERS = {
    "lower", "upper", "left", "right", "north", "south", "east", "west",
    "low", "high", "sit", "stand", "direct", "extension", "start",
    "finish", "short", "long", "variation", "variant",
}
NAME_FILLER = {"a", "an", "the", "of", "and", "to"}


def protected_name_conflict(left: str, right: str) -> bool:
    """Preserve named variants even when their fuzzy spellings look similar."""
    a = [NUMBER_WORDS.get(word, word) for word in left.split()]
    b = [NUMBER_WORDS.get(word, word) for word in right.split()]
    a_qualifiers = {word for word in a if word in NAME_QUALIFIERS or re.fullmatch(r"(?:p\d+|\d+)", word)}
    b_qualifiers = {word for word in b if word in NAME_QUALIFIERS or re.fullmatch(r"(?:p\d+|\d+)", word)}
    if a_qualifiers != b_qualifiers:
        return True
    if len(a) == len(b):
        for left_word, right_word in zip(a, b):
            if (left_word != right_word and left_word not in NAME_FILLER and right_word not in NAME_FILLER
                    and min(len(left_word), len(right_word)) <= 5
                    and distance.Levenshtein.distance(left_word, right_word) >= 2):
                return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    extra = []
    position = 0
    for word in longer:
        if position < len(shorter) and word == shorter[position]:
            position += 1
        else:
            extra.append(word)
    return position == len(shorter) and any(word not in NAME_FILLER for word in extra)


def name_similarity(left: str, right: str) -> float:
    if left.replace(" ", "") == right.replace(" ", ""):
        return 1.0
    if loose_core(left) == loose_core(right):
        return 0.96
    return fuzz.ratio(left, right) / 100


def parse_grade(climb_type: str, vscale: str | None, yds: str | None) -> tuple[int | None, str, str]:
    raw = (vscale if climb_type == "boulder" else yds) or ""
    clean = raw.strip().casefold()
    exact = GRADE_INDEX[climb_type].get(clean)
    if exact is not None:
        return exact, raw, "exact"
    if climb_type == "boulder":
        if clean in {"v-easy", "v easy", "v0-"}:
            return 0 if clean != "v0-" else 1, raw, "approximate"
        match = re.match(r"^(v\d+)(?:[+\-]|\s*(?:to|-)\s*v?\d+)$", clean)
    else:
        match = re.match(r"^(5\.\d+[abcd]?)(?:[+\-]|\s*(?:to|/|-)\s*[abcd]?\d*)$", clean)
    if match:
        base = GRADE_INDEX[climb_type].get(match.group(1))
        if base is not None:
            return base, raw, "approximate"
    return None, raw, "unmapped" if raw else "missing"


def rope_tier_gap(raw_yds: str | None, betabook_grade: int | None) -> int | None:
    if raw_yds is None or betabook_grade is None or not 0 <= betabook_grade < len(ROPE):
        return None
    source = re.search(r"\b5\.(\d{1,2})", raw_yds)
    target = re.match(r"5\.(\d{1,2})", ROPE[betabook_grade])
    return abs(int(source.group(1)) - int(target.group(1))) if source and target else None


def source_types(row: dict) -> tuple[str, ...]:
    result = []
    if row["is_boulder"]:
        result.append("boulder")
    if row["is_sport"]:
        result.append("sport")
    if row["is_trad"]:
        result.append("trad")
    return tuple(result)


def is_ungraded_source(row: dict) -> bool:
    """Whether every grade relevant to this source route is unspecified."""
    types = source_types(row)
    raw_grades = ([row["grade_vscale"] if climb_type == "boulder" else row["grade_yds"]
                   for climb_type in types] if types
                  else [row["grade_vscale"], row["grade_yds"]])
    return all((raw or "").strip().casefold() in UNSPECIFIED_SOURCE_GRADES
               for raw in raw_grades)


@dataclass(frozen=True)
class Area:
    id: int
    parent_id: int | None
    name: str
    new: bool = False


@dataclass(frozen=True)
class Climb:
    id: int
    area_id: int
    name: str
    type: str
    grade: int | None


def sql_value(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Non-finite SQL number")
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def write_sql_chunks(directory: Path, prefix: str, table: str, columns: tuple[str, ...], rows: list[tuple], chunk_size: int = 4000) -> list[str]:
    directory.mkdir(parents=True, exist_ok=True)
    names = []
    for offset in range(0, len(rows), chunk_size):
        name = f"{prefix}-{offset // chunk_size + 1:03}.sql"
        names.append(name)
        with (directory / name).open("w") as f:
            f.write(f"-- {table}: rows {offset + 1} through {min(offset + chunk_size, len(rows))}\n")
            cols = ",".join(f'"{column}"' for column in columns)
            for inner in range(offset, min(offset + chunk_size, len(rows)), 200):
                values = ",\n".join(
                    "(" + ",".join(sql_value(value) for value in row) + ")"
                    for row in rows[inner : inner + 200]
                )
                f.write(f'INSERT INTO "{table}" ({cols}) VALUES\n{values};\n')
    return names


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


class Reconciler:
    def __init__(self, catalog_sql: Path):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("BEGIN;\n" + catalog_sql.read_text() + "\nCOMMIT;")
        self.areas = {
            ident: Area(ident, parent, name)
            for ident, parent, name in self.db.execute("SELECT id,parent_id,name FROM areas")
        }
        self.climbs = [Climb(*row) for row in self.db.execute("SELECT id,area_id,name,type,grade FROM climbs")]
        self.base_area_count = len(self.areas)
        self.base_climb_count = len(self.climbs)
        self.base_area_max = max(self.areas)
        self.base_climb_max = max(c.id for c in self.climbs)
        self.next_area_id = self.base_area_max + 1
        self.next_climb_id = self.base_climb_max + 1
        self.area_paths: dict[int, tuple[int, ...]] = {}
        self.area_names: dict[int, tuple[str, ...]] = {}
        self.area_index: dict[tuple[int, str], list[int]] = defaultdict(list)
        self.area_compact_index: dict[tuple[int, str], list[int]] = defaultdict(list)
        self.child_index: dict[tuple[int, str], list[int]] = defaultdict(list)
        self.geo: dict[int, tuple[str, str]] = {}
        self.original_areas_by_country: dict[str, list[int]] = defaultdict(list)
        self.original_areas_by_state: dict[int, list[int]] = defaultdict(list)
        self.state_area_names: dict[int, dict[str, list[int]]] = {}
        for ident in self.areas:
            path = self.path(ident)
            names = self.path_names(ident)
            self.geo[ident] = (norm(names[1]) if len(names) > 1 else "", norm(names[2]) if len(names) > 2 else "")
            if len(path) >= 3:
                self.original_areas_by_country[norm(names[1])].append(ident)
            if len(path) >= 4:
                self.original_areas_by_state[path[2]].append(ident)
            # Index by the state ancestor; world/country nodes get indexed under themselves.
            anchor = path[2] if len(path) > 2 else ident
            self.area_index[(anchor, area_norm(self.areas[ident].name))].append(ident)
            self.area_compact_index[(anchor, area_norm(self.areas[ident].name).replace(" ", ""))].append(ident)
            if self.areas[ident].parent_id is not None:
                self.child_index[(self.areas[ident].parent_id, norm(self.areas[ident].name))].append(ident)
        self.climb_index: dict[tuple[str, str], list[Climb]] = defaultdict(list)
        self.compact_climb_index: dict[tuple[str, str], list[Climb]] = defaultdict(list)
        self.loose_climb_index: dict[tuple[str, str], list[Climb]] = defaultdict(list)
        self.climbs_under: dict[int, list[Climb]] = defaultdict(list)
        for climb in self.climbs:
            climb_core, climb_variant = name_parts(climb.name)
            self.climb_index[(climb_core, climb_variant)].append(climb)
            self.compact_climb_index[(climb_core.replace(" ", ""), climb_variant)].append(climb)
            self.loose_climb_index[(loose_core(climb_core), climb_variant)].append(climb)
            for ancestor in self.path(climb.area_id):
                self.climbs_under[ancestor].append(climb)
        self.location_map: dict[tuple[str, ...], tuple[int, str]] = {}
        self.reviewed_area_aliases: dict[int, str] = {}
        self.source_names_by_location: dict[tuple[str, ...], set[tuple[str, str]]] = defaultdict(set)
        self.area_review: list[dict] = []

    def path(self, area_id: int) -> tuple[int, ...]:
        if area_id not in self.area_paths:
            area = self.areas[area_id]
            self.area_paths[area_id] = (self.path(area.parent_id) if area.parent_id else ()) + (area_id,)
        return self.area_paths[area_id]

    def path_names(self, area_id: int) -> tuple[str, ...]:
        if area_id not in self.area_names:
            self.area_names[area_id] = tuple(self.areas[i].name for i in self.path(area_id))
        return self.area_names[area_id]

    def add_area(self, parent: int, name: str) -> int:
        key = (parent, norm(name))
        existing = self.child_index.get(key, [])
        if len(existing) == 1:
            return existing[0]
        ident = self.next_area_id
        self.next_area_id += 1
        self.areas[ident] = Area(ident, parent, name, True)
        self.child_index[key].append(ident)
        self.path(ident)
        self.path_names(ident)
        return ident

    def reparent_area(self, area_id: int, new_parent: int) -> int:
        """Move an existing area subtree without discarding its detailed children."""
        area = self.areas[area_id]
        old_parent = area.parent_id
        if old_parent is None or area_id in self.path(new_parent):
            raise ValueError(f"Invalid area reparent: {area_id} -> {new_parent}")
        if self.child_index.get((new_parent, norm(area.name)), []):
            # The proposed OpenBeta leaf is intentionally only a planning node.
            existing = self.child_index[(new_parent, norm(area.name))]
            if any(not self.areas[other].new for other in existing):
                raise ValueError(f"Existing child conflicts with area reparent: {area_id}")
        self.child_index[(old_parent, norm(area.name))].remove(area_id)
        self.child_index[(new_parent, norm(area.name))].append(area_id)
        self.areas[area_id] = Area(area.id, new_parent, area.name, area.new)
        self.area_paths.clear()
        self.area_names.clear()
        return old_parent

    def get_root(self, name: str) -> int | None:
        matches = [a.id for a in self.areas.values() if a.parent_id is None and area_norm(a.name) == area_norm(name)]
        return matches[0] if len(matches) == 1 else None

    def get_child(self, parent: int, name: str) -> int:
        matches = self.child_index.get((parent, norm(name)), [])
        if len(matches) == 1:
            return matches[0]
        return self.add_area(parent, name)

    def location(self, row: dict) -> tuple[str, ...]:
        country = COUNTRY_NAMES.get(row["country"], row["country"])
        values = (country, row["state_province"], row["region"], row["area"], row["crag"])
        return tuple((x or "").strip() for x in values)

    def resolve_location(self, location: tuple[str, ...]) -> tuple[int, str]:
        if location in self.location_map:
            return self.location_map[location]
        country, state, *rest = location
        continent = COUNTRY_CONTINENTS.get(country, "Uncategorized")
        root = self.get_root(continent)
        if root is None:
            raise ValueError(f"Missing continent root: {continent}")
        country_id = self.get_child(root, country)
        state_id = self.get_child(country_id, canonical_state(country, state)) if state else country_id
        segments = source_area_segments(rest, canonical_state(country, state))
        if not segments:
            result = (state_id, "state_only")
            self.location_map[location] = result
            return result
        source_path = " > ".join(value for value in location if value)
        aliases = [(original, prefix) for original, prefix in self.reviewed_area_aliases.items()
                   if source_path == prefix or source_path.startswith(prefix + " > ")]
        if aliases:
            original, prefix = max(aliases, key=lambda entry: len(entry[1]))
            prefix_segments = source_area_segments(prefix.split(" > ")[2:],
                                                   canonical_state(country, state))
            area_id = original
            for segment in segments[len(prefix_segments):]:
                area_id = self.get_child(area_id, segment)
            result = (area_id, "reviewed_area_alias")
            self.location_map[location] = result
            return result

        # Find the deepest OpenBeta token that can safely align with a current
        # Betabook descendant. A skipped OpenBeta prefix is recorded, not grafted
        # above an existing Betabook branch.
        candidates = []
        state_path = self.path(state_id)
        uniquely_named_prior = {}
        for source_index, segment in enumerate(segments):
            exact_ids = [candidate_id for candidate_id in self.area_index.get((state_id, area_norm(segment)), [])
                         if norm(self.areas[candidate_id].name) == norm(segment)]
            if len(exact_ids) == 1:
                uniquely_named_prior[source_index] = exact_ids[0]
        for source_index, segment in enumerate(segments):
            token = area_norm(segment)
            area_ids = set(self.area_index.get((state_id, token), []))
            area_ids.update(self.area_compact_index.get((state_id, token.replace(" ", "")), []))
            for candidate_id in area_ids:
                candidate = self.areas[candidate_id]
                if candidate.new or self.path(candidate_id)[: len(state_path)] != state_path:
                    continue
                prior_anchors = [(prior_index, anchor) for prior_index, anchor in uniquely_named_prior.items()
                                 if prior_index < source_index]
                if prior_anchors:
                    _, closest_anchor = max(prior_anchors)
                    if closest_anchor not in self.path(candidate_id):
                        continue
                path_norms = [area_norm(x) for x in self.path_names(candidate_id)[len(state_path) :]]
                prior = [area_norm(x) for x in segments[:source_index]]
                support = sum(1 for x in prior if x in path_norms[:-1])
                generic = token in {
                    "main wall", "the cave", "central", "roadside", "unknown",
                    "west", "east", "north", "south", "left", "right",
                    "upper", "lower", "middle", "main", "center", "wall",
                    "boulder", "cave", "slab", "sector", "area",
                    "left end", "right end", "upper wall", "lower wall",
                } or bool(GENERIC_AREA_TOKEN.fullmatch(token))
                # A Main Cliff or East Face is meaningful only under its own
                # named parent; a broader state match is not enough.
                if generic and (not prior or prior[-1] not in path_norms[:-1]):
                    continue
                raw_exact = norm(candidate.name) == norm(segment)
                score = source_index * 10 + int(raw_exact) * 4 + support * 3 - max(0, len(path_norms) - source_index - 1)
                candidates.append((score, source_index, support, candidate_id, raw_exact))
        candidates.sort(key=lambda x: (-x[0], len(self.path(x[3])), x[3]))
        chosen = None
        if candidates:
            best = candidates[0]
            runner = candidates[1] if len(candidates) > 1 else None
            if runner is None or best[0] - runner[0] >= 2 or best[3] == runner[3]:
                chosen = best
            elif best[3] in self.path(runner[3]) and best[4]:
                chosen = best
        if chosen:
            _, index, support, area_id, _ = chosen
            quality = "aligned" if support or index == 0 else "aligned_skipped_prefix"
            if index > 0 and not support:
                self.area_review.append({"location": " > ".join(location), "area_id": area_id, "reason": "skipped_source_prefix", "betabook_path": " > ".join(self.path_names(area_id))})
            missing = segments[index + 1 :]
        else:
            area_id = state_id
            quality = "new_branch" if not candidates else "ambiguous_anchor"
            missing = segments if not candidates else []
            if candidates:
                self.area_review.append({"location": " > ".join(location), "area_id": state_id, "reason": "ambiguous_anchor", "betabook_path": " > ".join(self.path_names(state_id))})
        for segment in missing:
            area_id = self.get_child(area_id, segment)
        result = (area_id, quality)
        self.location_map[location] = result
        return result

    def compatible(self, source: dict, climb: Climb) -> bool:
        return climb.type in source_types(source)

    def area_similarity(self, source: dict, climb: Climb, mapped_id: int) -> float:
        source_tokens = [area_norm(x) for x in source_area_segments(
            (source["region"], source["area"], source["crag"]), source["state_province"])]
        prod_tokens = [area_norm(x) for x in self.path_names(climb.area_id)[3:]]
        shared = 0.0
        for token in source_tokens:
            if token in prod_tokens:
                shared += 1
            elif len(token) > 5 and prod_tokens:
                best = max(fuzz.ratio(token, x) for x in prod_tokens if x) / 100
                if best >= 0.87:
                    shared += best * 0.7
        source_path = self.path(mapped_id)
        prod_path = self.path(climb.area_id)
        related = source_path[: len(prod_path)] == prod_path or prod_path[: len(source_path)] == source_path
        return shared + (0.8 if related else 0)

    def branch_conflict(self, source: dict, climb: Climb) -> bool:
        """Reject same named routes at different named crags below a shared area."""
        source_path = " > ".join(value for value in self.location(source) if value)
        mapped = self.location_map.get(self.location(source))
        if mapped:
            for root, prefix in self.reviewed_area_aliases.items():
                if (not (source_path == prefix or source_path.startswith(prefix + " > "))
                        or root not in self.path(mapped[0])
                        or root not in self.path(climb.area_id)):
                    continue
                prefix_parts = prefix.split(" > ")
                source_segments = source_area_segments(self.location(source)[2:], self.location(source)[1])
                prefix_segments = source_area_segments(prefix_parts[2:], self.location(source)[1])
                source_tail = {area_norm(value) for value in source_segments[len(prefix_segments):]}
                original_path = self.path(climb.area_id)
                root_index = original_path.index(root)
                original_tail = {area_norm(self.areas[ident].name)
                                 for ident in original_path[root_index + 1:]}
                return bool(source_tail and original_tail and not source_tail & original_tail)
        source_tokens = [area_norm(x) for x in source_area_segments(
            (source["region"], source["area"], source["crag"]), source["state_province"])]
        prod_tokens = [area_norm(x) for x in self.path_names(climb.area_id)[3:]]
        common = [(i, j) for i, left in enumerate(source_tokens) for j, right in enumerate(prod_tokens) if left == right]
        if not common:
            return bool(source_tokens and prod_tokens)
        i, j = max(common)
        return i < len(source_tokens) - 1 and j < len(prod_tokens) - 1

    def candidates(self, source: dict, mapped_id: int) -> list[tuple[float, Climb, str]]:
        core, variant = name_parts(source["climb_name"] or "")
        if not core:
            return []
        exact = self.climb_index.get((core, variant), [])
        if not exact and variant == "stand":
            exact = self.climb_index.get((core, "regular"), [])
        compact = self.compact_climb_index.get((core.replace(" ", ""), variant), [])
        if not compact and variant == "stand":
            compact = self.compact_climb_index.get((core.replace(" ", ""), "regular"), [])
        potential_by_id: dict[int, tuple[Climb, str]] = {c.id: (c, "exact_name") for c in exact}
        for climb in compact:
            potential_by_id.setdefault(climb.id, (climb, "compact_name"))
        loose = self.loose_climb_index.get((loose_core(core), variant), [])
        if not loose and variant == "stand":
            loose = self.loose_climb_index.get((loose_core(core), "regular"), [])
        for climb in loose:
            potential_by_id.setdefault(climb.id, (climb, "article_alias"))
        # A new OpenBeta subarea may sit under an existing Betabook crag. Search
        # that named ancestor rather than losing near-name routes in the new child.
        existing_anchor = next((area_id for area_id in reversed(self.path(mapped_id))
                                if area_id <= self.base_area_max), None)
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        anchor_depth = len(self.path(existing_anchor)) if existing_anchor else 0
        known_crag_anchor = anchor_depth >= 4 or (country not in {"United States", "Canada"} and anchor_depth >= 3)
        if existing_anchor and known_crag_anchor and len(core.replace(" ", "")) >= 5:
            pool = self.climbs_under.get(existing_anchor, [])
            if 0 < len(pool) <= 3000:
                grades = {climb_type: parse_grade(climb_type, source["grade_vscale"], source["grade_yds"])[0]
                          for climb_type in source_types(source)}
                eligible = []
                for climb in pool:
                    climb_core, climb_variant = name_parts(climb.name)
                    source_grade = grades.get(climb.type)
                    if climb_variant != variant:
                        continue
                    if source_grade is None and (len(core) < (6 if anchor_depth == 3 else 12)
                                                 or fuzz.ratio(core, climb_core) < 85):
                        continue
                    if (source_grade is not None and climb.grade is not None
                            and abs(source_grade - climb.grade) > 2):
                        continue
                    eligible.append((climb, climb_core))
                keys = sorted({climb_core for _, climb_core in eligible})
                near = {key for key, _, _ in process.extract(core, keys, scorer=fuzz.ratio,
                                                               limit=12, score_cutoff=78)}
                for climb, climb_core in eligible:
                    if climb_core in near:
                        potential_by_id.setdefault(climb.id, (climb, "fuzzy_name"))
        source_geo = (norm(country), norm(canonical_state(country, source["state_province"])))
        scored = []
        for climb, match_kind in potential_by_id.values():
            prod_geo = self.geo[climb.area_id]
            if prod_geo != source_geo:
                # Unclassified historical Betabook areas can still match if
                # their named crag strongly agrees; assessed below.
                if self.path_names(climb.area_id)[0] != "Uncategorized":
                    continue
            if not self.compatible(source, climb):
                continue
            candidate_core = name_parts(climb.name)[0]
            name_score = name_similarity(core, candidate_core)
            area_score = self.area_similarity(source, climb, mapped_id)
            if prod_geo != source_geo and area_score < 1.7:
                continue
            grade, _, grade_quality = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
            gap = abs(grade - climb.grade) if grade is not None and climb.grade is not None else None
            score = name_score * 100 + min(area_score, 3) * 13 + (6 if gap == 0 else 3 if gap == 1 else 0)
            if gap is not None and gap > 3:
                score -= 16
            scored.append((score, climb, match_kind + ("_approx_grade" if grade_quality == "approximate" else "")))
        return sorted(scored, key=lambda x: (-x[0], x[1].id))

    def incompatible_type_candidate(self, source: dict, mapped_id: int) -> Climb | None:
        core, variant = name_parts(source["climb_name"] or "")
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        geo = (norm(country), norm(canonical_state(country, source["state_province"])))
        for climb in self.climb_index.get((core, variant), []):
            if self.geo[climb.area_id] == geo and not self.compatible(source, climb):
                if self.area_similarity(source, climb, mapped_id) >= 0.8 and not self.branch_conflict(source, climb):
                    return climb
        return None

    def aka_base_candidate(self, source: dict, mapped_id: int) -> Climb | None:
        """An explicit AKA suffix suggests an existing base name, for review only."""
        alias = AKA_SUFFIX.search(source["climb_name"] or "")
        if not alias:
            return None
        core, variant = name_parts(source["climb_name"][:alias.start()])
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        geo = (norm(country), norm(canonical_state(country, source["state_province"])))
        candidates = self.loose_climb_index.get((loose_core(core), variant), [])
        for climb in candidates:
            if self.geo[climb.area_id] != geo or not self.compatible(source, climb):
                continue
            grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
            if grade is not None and climb.grade is not None and abs(grade - climb.grade) > 2:
                continue
            if self.area_similarity(source, climb, mapped_id) >= 0.8 and not self.branch_conflict(source, climb):
                return climb
        return None

    def same_name_region_candidate(self, source: dict) -> Climb | None:
        """A same named route in one state/province is too suspicious to insert."""
        core, variant = name_parts(source["climb_name"] or "")
        if loose_core(core) in {"unknown", "unnamed", "center", "thefin", "project"}:
            return None
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        geo = (norm(country), norm(canonical_state(country, source["state_province"])))
        variants = (variant, "regular") if variant == "stand" else (variant,)
        for check_variant in variants:
            for climb in self.loose_climb_index.get((loose_core(core), check_variant), []):
                if self.geo[climb.area_id] != geo:
                    continue
                if (climb.type == "boulder") != ("boulder" in source_types(source)):
                    continue
                grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
                if grade is not None and climb.grade is not None and abs(grade - climb.grade) > 2:
                    continue
                return climb
        return None

    def same_name_country_candidate(self, source: dict, mapped_id: int) -> Climb | None:
        """Hold exact-name routes where source and Betabook divide a country differently."""
        original_anchor = next((area_id for area_id in reversed(self.path(mapped_id))
                                if area_id <= self.base_area_max), None)
        if original_anchor is None or len(self.path(original_anchor)) > 2:
            return None
        core, variant = name_parts(source["climb_name"] or "")
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        source_areas = [area_norm(value) for value in
                        [source["state_province"]] + source_area_segments(
                            (source["region"], source["area"], source["crag"]), source["state_province"])
                        if value and len(area_norm(value)) >= 6]
        best: tuple[float, Climb] | None = None
        for area_id in self.original_areas_by_country.get(norm(country), []):
            area_name = area_norm(self.areas[area_id].name)
            agreement = max((1.0 if left.replace(" ", "") == area_name.replace(" ", "")
                             else fuzz.ratio(left, area_name) / 100)
                            for left in source_areas) if source_areas else 0.0
            if agreement < 0.78:
                continue
            for climb in self.climbs_under.get(area_id, []):
                candidate_core, candidate_variant = name_parts(climb.name)
                if candidate_variant != variant or not self.compatible(source, climb):
                    continue
                name_score = name_similarity(core, candidate_core)
                if name_score < 0.78 or protected_name_conflict(core, candidate_core):
                    continue
                grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
                if grade is not None and climb.grade is not None and abs(grade - climb.grade) > 2:
                    continue
                if grade is None and name_score < 0.90:
                    continue
                score = agreement * 40 + name_score * 100 + (5 if grade == climb.grade else 0)
                if best is None or score > best[0]:
                    best = (score, climb)
        return best[1] if best else None

    def same_area_state_fuzzy_candidate(self, source: dict, mapped_id: int) -> Climb | None:
        """Review near-name routes in a similarly named crag under one state."""
        anchor = next((area_id for area_id in reversed(self.path(mapped_id))
                       if area_id <= self.base_area_max), None)
        if anchor is None or len(self.path(anchor)) != 3:
            return None
        country = COUNTRY_NAMES.get(source["country"], source["country"])
        if country not in {"United States", "Canada"}:
            return None
        core, variant = name_parts(source["climb_name"] or "")
        if len(core) < 6:
            return None
        source_areas = [area_norm(value) for value in source_area_segments(
                        (source["region"], source["area"], source["crag"]), source["state_province"])
                        if value and len(area_norm(value)) >= 6]
        best: tuple[float, Climb] | None = None
        if anchor not in self.state_area_names:
            names: dict[str, list[int]] = defaultdict(list)
            for area_id in self.original_areas_by_state.get(anchor, []):
                names[area_norm(self.areas[area_id].name)].append(area_id)
            self.state_area_names[anchor] = names
        names = self.state_area_names[anchor]
        candidate_areas = set()
        for source_area in source_areas:
            for area_name, _, _ in process.extract(source_area, names.keys(), scorer=fuzz.ratio,
                                                   limit=15, score_cutoff=75):
                candidate_areas.update(names[area_name])
        for area_id in candidate_areas:
            area_name = area_norm(self.areas[area_id].name)
            agreement = max((1.0 if left.replace(" ", "") == area_name.replace(" ", "")
                             else fuzz.ratio(left, area_name) / 100
                             if fuzz.token_set_ratio(left, area_name) >= 95 else 0.0)
                            for left in source_areas) if source_areas else 0.0
            if agreement < 0.75:
                continue
            for climb in self.climbs_under.get(area_id, []):
                candidate_core, candidate_variant = name_parts(climb.name)
                if candidate_variant != variant or not self.compatible(source, climb):
                    continue
                name_score = name_similarity(core, candidate_core)
                if name_score < 0.78 or protected_name_conflict(core, candidate_core):
                    continue
                grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
                if grade is not None and climb.grade is not None and abs(grade - climb.grade) > 2:
                    continue
                if grade is None and name_score < 0.90:
                    continue
                score = agreement * 40 + name_score * 100 + (5 if grade == climb.grade else 0)
                if best is None or score > best[0]:
                    best = (score, climb)
        return best[1] if best else None

    def decide(self, source: dict, mapped_id: int) -> tuple[str, Climb | None, str, float]:
        scored = self.candidates(source, mapped_id)
        if not scored:
            return "new", None, "no_candidate", 0
        score, climb, kind = scored[0]
        runner = scored[1][0] if len(scored) > 1 else -1
        area = self.area_similarity(source, climb, mapped_id)
        source_core, candidate_core = name_parts(source["climb_name"])[0], name_parts(climb.name)[0]
        if source_core != candidate_core and name_parts(climb.name) in self.source_names_by_location.get(self.location(source), set()):
            return "review", climb, "source_has_both_names", score
        name_score = name_similarity(source_core, candidate_core)
        grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
        gap = abs(grade - climb.grade) if grade is not None and climb.grade is not None else None
        if gap is None and climb.type != "boulder":
            tier_gap = rope_tier_gap(source["grade_yds"], climb.grade)
            if tier_gap is not None and tier_gap >= 2:
                return "review", climb, "grade_tier_conflict", score
        generic_name = name_parts(source["climb_name"])[0] in {"unknown", "unnamed", "center", "the fin", "project"}
        aliases = []
        preferred_specific_duplicate = False
        for _, alternative, _ in scored[1:]:
            if loose_core(name_parts(alternative.name)[0]) != loose_core(source_core):
                continue
            alternative_grade, _, _ = parse_grade(alternative.type, source["grade_vscale"], source["grade_yds"])
            alternative_gap = (abs(alternative_grade - alternative.grade)
                               if alternative_grade is not None and alternative.grade is not None else None)
            best_path = self.path(climb.area_id)
            alternative_path = self.path(alternative.area_id)
            mapped_path = self.path(mapped_id)
            if (len(best_path) > len(alternative_path)
                    and best_path[:len(alternative_path)] == alternative_path
                    and best_path[:len(mapped_path)] == mapped_path
                    and grade is not None and alternative_grade is not None
                    and gap is not None and gap <= 1
                    and alternative_gap is not None and alternative_gap <= 1):
                preferred_specific_duplicate = True
                continue
            if (self.area_similarity(source, alternative, mapped_id) >= 0.8
                    and not self.branch_conflict(source, alternative)
                    and (alternative_gap is None or alternative_gap <= 1)):
                aliases.append(alternative)
        if aliases:
            return "review", climb, "multiple_existing_area_variants", score
        if protected_name_conflict(source_core, candidate_core):
            return "review", climb, "different_name_variant", score
        if kind.startswith("fuzzy_name"):
            return "review", climb, "fuzzy_name_candidate", score
        if (name_score >= 0.96 and area >= (1.8 if generic_name else 0.8)
                and not self.branch_conflict(source, climb)
                and (gap is None or gap <= 1) and score - runner >= 10):
            return "match", climb, kind + ("_specific_original" if preferred_specific_duplicate else ""), score
        return "review", climb, "ambiguous_or_weak_match", score


def load_source(parquet: Path) -> list[dict]:
    conn = duckdb.connect()
    # The source release can repeat identical UUID rows. DISTINCT removes only
    # byte-identical records; conflicting UUIDs are rejected below.
    relation = conn.execute("SELECT DISTINCT * FROM read_parquet(?) ORDER BY climb_id", [str(parquet)])
    fields = [column[0] for column in relation.description]
    rows = [dict(zip(fields, values)) for values in relation.fetchall()]
    seen = set()
    for row in rows:
        row["climb_id"] = str(row["climb_id"])
        if row["climb_id"] in seen:
            raise ValueError(f"Conflicting rows for OpenBeta UUID {row['climb_id']}")
        seen.add(row["climb_id"])
    return rows


SOURCE_TEXT_FIELDS = (
    "climb_name", "description", "country", "state_province", "region",
    "area", "crag", "grade_vscale", "grade_yds",
)


def decode_source_text(rows: list[dict]) -> int:
    """Run OpenBeta text through Betabook's existing TypeScript entity decoder."""
    if not rows:
        return 0
    decoder = Path(__file__).parents[1] / "lib" / "openbeta-decode-text.mts"
    process = subprocess.Popen(
        ["node", "--experimental-strip-types", str(decoder)],
        cwd=Path(__file__).parents[1], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
    )
    changed = 0
    try:
        assert process.stdin is not None and process.stdout is not None
        for offset in range(0, len(rows), 1000):
            batch = rows[offset : offset + 1000]
            values = [[row.get(field) for field in SOURCE_TEXT_FIELDS] for row in batch]
            process.stdin.write(json.dumps(values, ensure_ascii=False) + "\n")
            process.stdin.flush()
            line = process.stdout.readline()
            if not line:
                raise RuntimeError("Betabook HTML entity decoder stopped early")
            decoded = json.loads(line)
            if len(decoded) != len(batch):
                raise ValueError("Betabook HTML entity decoder changed the row count")
            for row, before, after in zip(batch, values, decoded):
                if len(after) != len(SOURCE_TEXT_FIELDS):
                    raise ValueError("Betabook HTML entity decoder changed the field count")
                for field, prior, value in zip(SOURCE_TEXT_FIELDS, before, after):
                    if prior != value:
                        row[field] = value
                        changed += 1
        process.stdin.close()
        if process.wait() != 0:
            assert process.stderr is not None
            raise RuntimeError(process.stderr.read())
    except Exception:
        process.kill()
        process.wait()
        raise
    finally:
        if process.stdout:
            process.stdout.close()
        if process.stderr:
            process.stderr.close()
    return changed


def reconcile_parallel_areas(matcher: Reconciler, targets: dict[str, int],
                             matched: list[dict], new: list[dict], review: list[dict],
                             unsupported: list[dict]) -> tuple[list[dict], list[tuple[int, int, int]], dict[str, int]]:
    """Use route identity to place an old area under a more detailed source parent.

    The original area ID and all its Betabook-only descendants survive. When
    neither hierarchy is deeper, keep the original area and use it for new
    source climbs. A contradictory intermediary remains unresolved.
    """
    by_path: dict[str, list[dict]] = defaultdict(list)
    for item in matched:
        by_path[item["openbeta_path"]].append(item)
    location_by_text = {" > ".join(x for x in location if x): location
                        for location in matcher.location_map}
    resolved = []
    reparents = []
    unresolved = {}
    # A route can also reveal that the *parent* of a proposed leaf already
    # exists elsewhere. Merge that planned parent first, so all of its source
    # child paths use the same existing area ID and retain their descendants.
    parent_merges: dict[int, tuple[int, int]] = {}
    for path, target in targets.items():
        location = location_by_text.get(path)
        if location is None:
            continue
        proposed, _ = matcher.location_map[location]
        planned_parent = matcher.areas[proposed].parent_id
        if planned_parent is None or not matcher.areas[planned_parent].new:
            continue
        planned_grandparent = matcher.areas[planned_parent].parent_id
        assert planned_grandparent is not None
        for item in by_path[path]:
            candidate = item["betabook_current_area_id"]
            if (candidate == target or candidate > matcher.base_area_max
                    or area_norm(matcher.areas[candidate].name)
                    != area_norm(matcher.areas[planned_parent].name)):
                continue
            old_parent = matcher.areas[candidate].parent_id
            if (old_parent is None or old_parent not in matcher.path(planned_grandparent)
                    or candidate in matcher.path(planned_grandparent)):
                continue
            planned = (candidate, planned_grandparent)
            if planned_parent in parent_merges and parent_merges[planned_parent] != planned:
                raise ValueError(f"Conflicting parent-area evidence: {path}")
            parent_merges[planned_parent] = planned
    for planned_id, (existing_id, new_parent) in sorted(
            parent_merges.items(), key=lambda pair: len(matcher.path(pair[0]))):
        original_parent = matcher.reparent_area(existing_id, new_parent)
        reparents.append((existing_id, original_parent, new_parent))
        for child in [area.id for area in matcher.areas.values() if area.parent_id == planned_id]:
            matcher.reparent_area(child, existing_id)
        for location, (area_id, quality) in list(matcher.location_map.items()):
            if area_id == planned_id:
                matcher.location_map[location] = (existing_id, "route_evidence_parent")
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["betabook_area_id"] == planned_id:
                    item["betabook_area_id"] = existing_id
                    item["betabook_area_path"] = " > ".join(matcher.path_names(existing_id))
    for path, target in sorted(targets.items()):
        location = location_by_text.get(path)
        if location is None:
            continue
        proposed, _ = matcher.location_map[location]
        if not matcher.areas[proposed].new or target in matcher.path(proposed):
            continue
        if len({item["betabook_area_id"] for item in by_path[path]}) != 1:
            unresolved[path] = target
            continue
        old_path = matcher.path(target)
        original_path = " > ".join(matcher.path_names(target))
        new_parent = matcher.areas[proposed].parent_id
        assert new_parent is not None
        old_parent = matcher.areas[target].parent_id
        assert old_parent is not None
        proposed_parent_path = matcher.path(new_parent)
        old_parent_path = matcher.path(old_parent)
        for item in by_path[path]:
            current_path = matcher.path(item["betabook_current_area_id"])
            if (old_path[: len(current_path)] != current_path
                    and current_path[: len(old_path)] != old_path
                    and proposed_parent_path[: len(current_path)] != current_path):
                unresolved[path] = target
                break
        if path in unresolved:
            continue
        source_names = [area_norm(value) for value in location[2:] if value]
        old_names = [area_norm(value) for value in matcher.path_names(target)]
        new_parent_names = matcher.path_names(new_parent)[3:]
        unexpected = [name for name in new_parent_names
                      if not any(max(fuzz.ratio(area_norm(name), candidate),
                                     fuzz.token_sort_ratio(area_norm(name), candidate)) >= 82
                                 for candidate in source_names + old_names)]
        if unexpected:
            # A state-wide name match can choose the wrong Sandy Cove, for
            # example. A source token that extends the old parent name gives
            # a safe anchor for rebuilding the missing parent chain there.
            parent_name = area_norm(matcher.areas[old_parent].name)
            segments = [segment for segment in location[2:] if segment]
            start = (next((i for i, segment in enumerate(segments[:-1])
                           if area_norm(segment).startswith(parent_name + " ")), None)
                     if len(parent_name) >= 5 else None)
            if start is None:
                unresolved[path] = target
                continue
            new_parent = old_parent
            for segment in segments[start:-1]:
                new_parent = matcher.get_child(new_parent, segment)
            proposed_parent_path = matcher.path(new_parent)

        action = "keep_existing"
        if len(proposed_parent_path) > len(old_parent_path):
            key = (new_parent, norm(matcher.areas[target].name))
            conflicting = any(other != target and not matcher.areas[other].new
                              for other in matcher.child_index.get(key, []))
            if target in proposed_parent_path or conflicting:
                unresolved[path] = target
                continue
            old_parent = matcher.reparent_area(target, new_parent)
            reparents.append((target, old_parent, new_parent))
            action = "reparent_existing_area"
        elif len(proposed_parent_path) < len(old_parent_path):
            # Betabook already has the more detailed placement.
            action = "keep_more_specific_existing"
        # Equal-depth alternative hierarchies do not justify moving an area.
        destination_path = " > ".join(matcher.path_names(target))
        matcher.location_map[location] = (target, "route_evidence_reparented" if action == "reparent_existing_area"
                                           else "route_evidence_existing")
        affected_new = 0
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["openbeta_path"] != path:
                    continue
                item["betabook_area_id"] = target
                item["betabook_area_path"] = destination_path
                item["area_quality"] = matcher.location_map[location][1]
                if collection is new:
                    affected_new += 1
        for item in by_path[path]:
            current_path = matcher.path(item["betabook_current_area_id"])
            target_path = matcher.path(target)
            item["move_to_area"] = target if (target_path[: len(current_path)] == current_path
                                               and len(target_path) > len(current_path)) else ""
        resolved.append({
            "openbeta_path": path, "existing_area_id": target,
            "original_area_path": original_path, "resolved_area_path": destination_path,
            "action": action, "old_parent_id": old_parent,
            "new_parent_id": new_parent if action == "reparent_existing_area" else "",
            "matched_routes": len(by_path[path]), "new_routes_reassigned": affected_new,
        })
    return resolved, reparents, unresolved


def parallel_route_targets(matcher: Reconciler, matched: list[dict]) -> dict[str, int]:
    evidence: dict[str, Counter[int]] = defaultdict(Counter)
    for item in matched:
        terminal = area_norm(item["openbeta_path"].split(" > ")[-1]).replace(" ", "")
        for ancestor in matcher.path(item["betabook_current_area_id"]):
            if (ancestor <= matcher.base_area_max
                    and area_norm(matcher.areas[ancestor].name).replace(" ", "") == terminal):
                evidence[item["openbeta_path"]][ancestor] += 1
    return {path: next(iter(candidates)) for path, candidates in evidence.items()
            if len(candidates) == 1 and sum(candidates.values()) >= 1}


def reconcile_skipped_source_parents(matcher: Reconciler, matched: list[dict],
                                     new: list[dict], review: list[dict],
                                     unsupported: list[dict],
                                     placement_exceptions: dict[str, int] | None = None,
                                     ) -> tuple[list[dict], list[tuple[int, int, int]]]:
    """Restore trusted source parents skipped when its leaf matched an old area."""
    by_path: dict[str, list[dict]] = defaultdict(list)
    by_original_area: dict[int, set[str]] = defaultdict(set)
    route_ids_by_original_area: dict[int, set[int]] = defaultdict(set)
    for item in matched:
        by_path[item["openbeta_path"]].append(item)
        for ancestor in matcher.path(item["betabook_current_area_id"]):
            if ancestor <= matcher.base_area_max:
                by_original_area[ancestor].add(item["openbeta_path"])
                route_ids_by_original_area[ancestor].add(item["betabook_id"])
    location_by_text = {" > ".join(x for x in location if x): location
                        for location in matcher.location_map}

    def source_prefix_for_area(location: tuple[str, ...], area_id: int) -> tuple[str, ...] | None:
        target = area_norm(matcher.areas[area_id].name).replace(" ", "")
        segments = source_area_segments(location[2:], location[1])
        for index, segment in enumerate(segments):
            if area_norm(segment).replace(" ", "") == target:
                return tuple(area_norm(value).replace(" ", "") for value in segments[:index])
        return None

    def raw_prefix_location_for_area(location: tuple[str, ...], area_id: int) -> tuple[str, ...] | None:
        target = area_norm(matcher.areas[area_id].name).replace(" ", "")
        for index in range(2, len(location)):
            segments = source_area_segments(location[2 : index + 1], location[1])
            if segments and area_norm(segments[-1]).replace(" ", "") == target:
                return location[:index] + ("",) * (len(location) - index)
        return None

    def refresh_restored_paths(area_id: int, source_prefix: tuple[str, ...]) -> None:
        affected_paths = set()
        for other_location, (mapped_area, mapped_quality) in list(matcher.location_map.items()):
            if area_id not in matcher.path(mapped_area):
                continue
            if source_prefix_for_area(other_location, area_id) != source_prefix:
                continue
            other_path = " > ".join(value for value in other_location if value)
            affected_paths.add(other_path)
            if mapped_quality == "aligned_skipped_prefix":
                matcher.location_map[other_location] = (mapped_area, "aligned_source_parents_restored")
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["openbeta_path"] in affected_paths:
                    mapped_area = item.get("betabook_area_id")
                    if mapped_area and area_id in matcher.path(mapped_area):
                        item["betabook_area_path"] = " > ".join(matcher.path_names(mapped_area))
                        if item["area_quality"] == "aligned_skipped_prefix":
                            item["area_quality"] = "aligned_source_parents_restored"
        for area_item in matcher.area_review:
            if area_item["location"] in affected_paths and area_item["reason"] == "skipped_source_prefix":
                area_item["reason"] = "reconciled_source_prefix"
                area_item["betabook_path"] = " > ".join(matcher.path_names(area_item["area_id"]))

    def has_conflicting_child(area_id: int, parent_id: int) -> bool:
        key = (parent_id, norm(matcher.areas[area_id].name))
        return any(other != area_id and not matcher.areas[other].new
                   for other in matcher.child_index.get(key, []))

    decisions = []
    reparents = []
    placement_exceptions = placement_exceptions or {}
    seen_exceptions = set()
    for path, items in sorted(by_path.items()):
        location = location_by_text.get(path)
        if not location:
            continue
        target, quality = matcher.location_map[location]
        if quality != "aligned_skipped_prefix" or target > matcher.base_area_max:
            continue
        if path in placement_exceptions:
            if placement_exceptions[path] != target:
                raise ValueError(f"Source-parent exception changed area: {path}")
            seen_exceptions.add(path)
            matcher.location_map[location] = (target, "source_parent_conflict")
            for collection in (matched, new, review, unsupported):
                for item in collection:
                    if item["openbeta_path"] == path:
                        item["area_quality"] = "source_parent_conflict"
            for area_item in matcher.area_review:
                if area_item["location"] == path and area_item["reason"] == "skipped_source_prefix":
                    area_item["reason"] = "source_parent_conflict"
            area_path = " > ".join(matcher.path_names(target))
            decisions.append({
                "openbeta_path": path, "existing_area_id": target,
                "original_area_path": area_path, "resolved_area_path": area_path,
                "action": "keep_existing_source_conflict",
                "old_parent_id": matcher.areas[target].parent_id, "new_parent_id": "",
                "matched_routes": len(items),
                "new_routes_reassigned": sum(item["openbeta_path"] == path for item in new),
            })
            continue
        old_path = matcher.path(target)
        if len(old_path) != 4:
            continue
        last = max((index for index in range(2, len(location)) if location[index]), default=1)
        cleaned = source_area_segments(location[2:], location[1])
        if (last <= 2 or not cleaned or area_norm(cleaned[-1]).replace(" ", "")
                != area_norm(matcher.areas[target].name).replace(" ", "")):
            continue
        target_prefix = source_prefix_for_area(location, target)
        related_paths = by_original_area[target]
        if (not target_prefix or any(
                source_prefix_for_area(location_by_text[other], target) != target_prefix
                for other in related_paths if other in location_by_text)):
            continue
        corroborated = {item["betabook_id"] for item in items
                        if target in matcher.path(item["betabook_current_area_id"])}
        if len(corroborated) < 2:
            continue
        prefix_location = location[:last] + ("",) * (len(location) - last)
        parent, parent_quality = matcher.resolve_location(prefix_location)
        if (parent_quality in {"ambiguous_anchor", "state_only"}
                or old_path[:-1] != matcher.path(parent)[: len(old_path) - 1]
                or target in matcher.path(parent)
                or len(matcher.path(parent)) <= len(old_path) - 1
                or has_conflicting_child(target, parent)):
            continue
        original_path = " > ".join(matcher.path_names(target))
        old_parent = matcher.reparent_area(target, parent)
        reparents.append((target, old_parent, parent))
        resolved_path = " > ".join(matcher.path_names(target))
        matcher.location_map[location] = (target, "aligned_source_parents_restored")
        refresh_restored_paths(target, target_prefix)
        decisions.append({
            "openbeta_path": path, "existing_area_id": target,
            "original_area_path": original_path, "resolved_area_path": resolved_path,
            "action": "restore_skipped_source_parents", "old_parent_id": old_parent,
            "new_parent_id": parent, "matched_routes": len(corroborated),
            "new_routes_reassigned": sum(item["openbeta_path"] == path for item in new),
        })
    # The exported five-token path may continue below the matched area, so the
    # area's name can be an intermediate token rather than the final crag.
    for target, related_paths in sorted(by_original_area.items()):
        if (target > matcher.base_area_max or len(matcher.path(target)) != 4
                or len(route_ids_by_original_area[target]) < 2
                or any(path in placement_exceptions for path in related_paths)):
            continue
        prefixes = {source_prefix_for_area(location_by_text[path], target)
                    for path in related_paths if path in location_by_text}
        if len(prefixes) != 1 or None in prefixes:
            continue
        source_prefix = next(iter(prefixes))
        if not source_prefix:
            continue
        representative = min(related_paths)
        location = location_by_text.get(representative)
        if not location:
            continue
        prefix_location = raw_prefix_location_for_area(location, target)
        if prefix_location is None:
            continue
        parent, parent_quality = matcher.resolve_location(prefix_location)
        old_path = matcher.path(target)
        if (parent_quality in {"ambiguous_anchor", "state_only"}
                or old_path[:-1] != matcher.path(parent)[: len(old_path) - 1]
                or target in matcher.path(parent)
                or len(matcher.path(parent)) <= len(old_path) - 1
                or has_conflicting_child(target, parent)):
            continue
        original_path = " > ".join(matcher.path_names(target))
        old_parent = matcher.reparent_area(target, parent)
        reparents.append((target, old_parent, parent))
        refresh_restored_paths(target, source_prefix)
        decisions.append({
            "openbeta_path": representative, "existing_area_id": target,
            "original_area_path": original_path,
            "resolved_area_path": " > ".join(matcher.path_names(target)),
            "action": "restore_intermediate_source_parents",
            "old_parent_id": old_parent, "new_parent_id": parent,
            "matched_routes": len(route_ids_by_original_area[target]),
            "new_routes_reassigned": sum(item["openbeta_path"] in related_paths for item in new),
        })
    for source_path, expected in placement_exceptions.items():
        if source_path in seen_exceptions:
            continue
        location = location_by_text.get(source_path)
        mapped = matcher.location_map[location][0] if location else None
        if mapped != expected:
            raise ValueError(f"Source-parent exception changed area: {source_path}")
        matcher.location_map[location] = (mapped, "source_parent_conflict")
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["openbeta_path"] == source_path:
                    item["area_quality"] = "source_parent_conflict"
        area_path = " > ".join(matcher.path_names(mapped))
        decisions.append({
            "openbeta_path": source_path, "existing_area_id": mapped,
            "original_area_path": area_path, "resolved_area_path": area_path,
            "action": "keep_existing_source_conflict",
            "old_parent_id": matcher.areas[mapped].parent_id, "new_parent_id": "",
            "matched_routes": sum(item["openbeta_path"] == source_path for item in matched),
            "new_routes_reassigned": sum(item["openbeta_path"] == source_path for item in new),
        })
        seen_exceptions.add(source_path)
    if seen_exceptions != set(placement_exceptions):
        raise ValueError(f"Unused source-parent exceptions: {sorted(set(placement_exceptions) - seen_exceptions)}")
    return decisions, reparents


def merge_duplicate_area_siblings(matcher: Reconciler, matched: list[dict], new: list[dict],
                                  review: list[dict], unsupported: list[dict],
                                  area_reparents: list[tuple[int, int, int]],
                                  area_resolutions: list[dict]) -> list[dict]:
    """Fold generated same-name siblings into the surviving original area ID."""
    collections = (matched, new, review, unsupported)
    active = set()
    for collection in collections:
        for item in collection:
            area_id = item.get("betabook_area_id")
            if area_id:
                active.update(matcher.path(area_id))
    for item in matched:
        if item.get("move_to_area"):
            active.update(matcher.path(int(item["move_to_area"])))

    def key(area_id: int) -> str:
        return area_norm(matcher.areas[area_id].name).replace(" ", "")

    def children(parent: int) -> list[int]:
        return [area.id for area in matcher.areas.values() if area.parent_id == parent]

    def can_merge(duplicate: int, survivor: int) -> bool:
        for child in children(duplicate):
            siblings = [other for other in children(survivor) if key(other) == key(child)]
            if len(siblings) > 1 or (siblings and (not matcher.areas[child].new
                                                    or not can_merge(child, siblings[0]))):
                return False
        return True

    redirects: dict[int, int] = {}
    merged_rows = []

    def merge(duplicate: int, survivor: int) -> None:
        old_path = " > ".join(matcher.path_names(duplicate))
        direct_new = sum(item.get("betabook_area_id") == duplicate for item in new)
        source_paths = sum(area_id == duplicate for area_id, _ in matcher.location_map.values())
        for child in children(duplicate):
            siblings = [other for other in children(survivor) if key(other) == key(child)]
            if siblings:
                merge(child, siblings[0])
            else:
                matcher.reparent_area(child, survivor)
                if not matcher.areas[child].new:
                    for index, (area_id, old_parent, _) in enumerate(area_reparents):
                        if area_id == child:
                            area_reparents[index] = (area_id, old_parent, survivor)
                            break
                    else:
                        raise ValueError(f"Original child lacks a recorded area move: {child}")
        redirects[duplicate] = survivor
        for collection in collections:
            for item in collection:
                if item.get("betabook_area_id") == duplicate:
                    item["betabook_area_id"] = survivor
                if item.get("move_to_area") == duplicate:
                    item["move_to_area"] = survivor
        for location, (area_id, quality) in list(matcher.location_map.items()):
            if area_id == duplicate:
                matcher.location_map[location] = (survivor, "merged_duplicate_area")
        for item in matcher.area_review:
            if item["area_id"] == duplicate:
                item["area_id"] = survivor
        for item in area_resolutions:
            if item.get("new_parent_id") == duplicate:
                item["new_parent_id"] = survivor
        for index, (area_id, old_parent, new_parent) in enumerate(area_reparents):
            if new_parent == duplicate:
                area_reparents[index] = (area_id, old_parent, survivor)
        merged_rows.append({
            "generated_area_id": duplicate, "surviving_area_id": survivor,
            "generated_area_path": old_path,
            "surviving_area_path": " > ".join(matcher.path_names(survivor)),
            "direct_new_routes_reassigned": direct_new,
            "source_paths_remapped": source_paths,
        })

    groups: dict[tuple[int, str], list[int]] = defaultdict(list)
    for area in matcher.areas.values():
        if area.parent_id is not None:
            groups[(area.parent_id, key(area.id))].append(area.id)
    for (_, _), ids in sorted(groups.items(), key=lambda entry: (len(matcher.path(entry[0][0])), entry[0][0])):
        originals = [area_id for area_id in ids if not matcher.areas[area_id].new]
        generated = [area_id for area_id in ids if matcher.areas[area_id].new and area_id in active]
        if len(originals) != 1:
            continue
        survivor = originals[0]
        for duplicate in generated:
            if duplicate in redirects or not can_merge(duplicate, survivor):
                continue
            merge(duplicate, survivor)
    return merged_rows


def plan_reviewed_original_area_merges(matcher: Reconciler, decisions: list[dict],
                                       final_parent_moves: list[dict] | None = None
                                       ) -> tuple[list[dict], list[dict], str]:
    """Plan lossless area-ID consolidation after all route/source inserts.

    Existing climb IDs and their user history remain intact. The reviewed rows
    may consolidate either original or imported area IDs. A later, separate
    climb-merge review can decide whether duplicate original climbs can safely
    be consolidated.
    """
    parent = {ident: area.parent_id for ident, area in matcher.areas.items()}
    names = {ident: area.name for ident, area in matcher.areas.items()}
    result = []
    sql = ["CREATE TABLE openbeta_area_merge_guard (ok INTEGER NOT NULL CHECK(ok=1));"]
    used_duplicates: set[int] = set()

    def children(area_id: int) -> list[int]:
        return [ident for ident, value in parent.items() if value == area_id]

    def quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    for row in decisions:
        duplicate = int(row["duplicate_area_id"])
        survivor = int(row["survivor_area_id"])
        if duplicate == survivor or duplicate in used_duplicates:
            raise ValueError(f"Invalid reviewed area merge: {duplicate} -> {survivor}")
        if duplicate not in parent or survivor not in parent:
            raise ValueError(f"Unknown reviewed original area: {duplicate} -> {survivor}")
        if names[duplicate] != row["duplicate_name"] or names[survivor] != row["survivor_name"]:
            raise ValueError(f"Reviewed original-area name changed: {duplicate} -> {survivor}")
        cursor = survivor
        while cursor is not None:
            if cursor == duplicate:
                raise ValueError(f"Original-area merge would create a cycle: {duplicate} -> {survivor}")
            cursor = parent[cursor]
        moving_children = children(duplicate)
        survivor_children = children(survivor)
        collisions = {(area_norm(names[child]), child, other)
                      for child in moving_children for other in survivor_children
                      if area_norm(names[child]) == area_norm(names[other])}
        if collisions:
            raise ValueError(f"Reviewed area merge has child collisions: {collisions}")
        old_parent = parent[duplicate]
        if old_parent is None:
            raise ValueError(f"Cannot merge a catalog root: {duplicate}")
        duplicate_name, survivor_name = names[duplicate], names[survivor]
        # A scope on a narrow descendant cannot be promoted to a broader
        # ancestor without granting an admin access to unrelated children.
        broadens_scope = False
        cursor = old_parent
        while cursor is not None:
            if cursor == survivor:
                broadens_scope = True
                break
            cursor = parent[cursor]
        sql.extend([
            "INSERT INTO openbeta_area_merge_guard (ok) SELECT CASE WHEN "
            f"(SELECT name FROM areas WHERE id={duplicate})={quote(duplicate_name)} AND "
            f"(SELECT parent_id FROM areas WHERE id={duplicate})={old_parent} AND "
            f"(SELECT name FROM areas WHERE id={survivor})={quote(survivor_name)} AND "
            f"(SELECT description FROM areas WHERE id={duplicate}) IS NULL AND "
            "NOT EXISTS(SELECT 1 FROM change_requests WHERE status='pending' "
            f"AND entity_id={duplicate} AND type IN ('area_edit','area_delete','area_reparent')) AND "
            + (f"NOT EXISTS(SELECT 1 FROM admin_area_scopes WHERE area_id={duplicate}) AND "
               if broadens_scope else "")
            + "1=1 THEN 1 ELSE 0 END;",
            "DELETE FROM openbeta_area_merge_guard;",
        ])
        if not broadens_scope:
            sql.append("INSERT OR IGNORE INTO admin_area_scopes (user_id,area_id,created_at) "
                       f"SELECT user_id,{survivor},created_at FROM admin_area_scopes WHERE area_id={duplicate};")
        sql.extend([
            f"UPDATE catalog_area_sources SET area_id={survivor} WHERE area_id={duplicate};",
            f"UPDATE climbs SET area_id={survivor} WHERE area_id={duplicate};",
            f"UPDATE areas SET parent_id={survivor} WHERE parent_id={duplicate};",
            f"DELETE FROM areas WHERE id={duplicate};",
        ])
        for child in moving_children:
            parent[child] = survivor
        del parent[duplicate]
        del names[duplicate]
        display_name = row.get("survivor_display_name", "").strip()
        if display_name and display_name != survivor_name:
            sql.append(f"UPDATE areas SET name={quote(display_name)} WHERE id={survivor} "
                       f"AND name={quote(survivor_name)};")
            names[survivor] = display_name
        new_parent_text = row.get("survivor_new_parent_area_id", "").strip()
        if new_parent_text:
            new_parent = int(new_parent_text)
            if new_parent not in parent or new_parent == survivor:
                raise ValueError(f"Invalid merged-area parent: {survivor} -> {new_parent}")
            cursor = new_parent
            while cursor is not None:
                if cursor == survivor:
                    raise ValueError(f"Merged-area parent would create cycle: {survivor} -> {new_parent}")
                cursor = parent[cursor]
            other_names = [names[ident] for ident in children(new_parent)
                           if ident != survivor]
            if any(area_norm(name) == area_norm(names[survivor]) for name in other_names):
                raise ValueError(f"Merged-area parent has same-name child: {survivor} -> {new_parent}")
            previous_parent = parent[survivor]
            sql.append(f"UPDATE areas SET parent_id={new_parent} WHERE id={survivor} "
                       f"AND parent_id={previous_parent};")
            parent[survivor] = new_parent
        used_duplicates.add(duplicate)
        result.append({**row, "old_parent_id": old_parent,
                       "direct_original_climbs_moved": matcher.db.execute(
                           "SELECT COUNT(*) FROM climbs WHERE area_id=?", (duplicate,)).fetchone()[0],
                       "child_areas_moved": len(moving_children),
                       "duplicate_path": " > ".join(matcher.path_names(duplicate)),
                       "survivor_path": " > ".join(matcher.path_names(survivor))})
    applied_parent_moves = []
    for row in final_parent_moves or []:
        area_id, new_parent = int(row["area_id"]), int(row["new_parent_id"])
        if area_id not in parent or new_parent not in parent or area_id == new_parent:
            raise ValueError(f"Invalid final area parent move: {area_id} -> {new_parent}")
        old_parent = parent[area_id]
        if old_parent != int(row["expected_old_parent_id"]) or names[area_id] != row["area_name"]:
            raise ValueError(f"Final area parent changed: {area_id}: {old_parent}")
        if names[new_parent] != row["new_parent_name"]:
            raise ValueError(f"Final area parent name changed: {new_parent}")
        cursor = new_parent
        while cursor is not None:
            if cursor == area_id:
                raise ValueError(f"Final area move would create a cycle: {area_id} -> {new_parent}")
            cursor = parent[cursor]
        if any(area_norm(names[other]) == area_norm(names[area_id])
               for other in children(new_parent) if other != area_id):
            raise ValueError(f"Final area move has same-name child: {area_id} -> {new_parent}")
        sql.append("INSERT INTO openbeta_area_merge_guard (ok) SELECT CASE WHEN "
                   f"(SELECT name FROM areas WHERE id={area_id})={quote(names[area_id])} AND "
                   f"(SELECT parent_id FROM areas WHERE id={area_id})={old_parent} AND "
                   f"(SELECT name FROM areas WHERE id={new_parent})={quote(names[new_parent])} "
                   "THEN 1 ELSE 0 END;")
        sql.append("DELETE FROM openbeta_area_merge_guard;")
        sql.append(f"UPDATE areas SET parent_id={new_parent} WHERE id={area_id} AND parent_id={old_parent};")
        parent[area_id] = new_parent
        applied_parent_moves.append(row)
    sql.append("DROP TABLE openbeta_area_merge_guard;")
    return result, applied_parent_moves, "\n".join(sql) + "\n"


def plan_reviewed_final_climb_moves(matcher: Reconciler, decisions: list[dict]) -> str:
    """Move reviewed original climb IDs before consolidating their old areas."""
    climbs = {climb.id: climb for climb in matcher.climbs}
    sql = ["CREATE TABLE openbeta_climb_move_guard (ok INTEGER NOT NULL CHECK(ok=1));"]

    def quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    for row in decisions:
        climb_id = int(row["climb_id"])
        old_area, target_area = int(row["expected_area_id"]), int(row["target_area_id"])
        climb = climbs.get(climb_id)
        if old_area not in matcher.areas or target_area not in matcher.areas:
            raise ValueError(f"Unknown final climb move area: {climb_id}: {old_area} -> {target_area}")
        old_path = matcher.path(old_area)
        target_path = matcher.path(target_area)
        country = matcher.areas[old_path[1]].name if len(old_path) > 1 else ""
        geo_depth = 3 if country in {"United States", "Canada"} else 2
        if (not climb or old_area == target_area or climb.area_id != old_area
                or climb.name != row["climb_name"] or climb.type != row["climb_type"]
                or climb.grade != int(row["grade_ordinal"]) or not row["source_url"]
                or target_area not in matcher.areas
                or (old_path[:geo_depth] != target_path[:geo_depth]
                    and not any(matcher.areas[ancestor].name == "Unknown"
                                for ancestor in old_path))):
            raise ValueError(f"Invalid final climb move: {climb_id}: {old_area} -> {target_area}")
        sql.extend([
            "INSERT INTO openbeta_climb_move_guard (ok) SELECT CASE WHEN "
            f"(SELECT area_id FROM climbs WHERE id={climb_id})={old_area} AND "
            f"(SELECT name FROM climbs WHERE id={climb_id})={quote(climb.name)} AND "
            f"(SELECT type FROM climbs WHERE id={climb_id})={quote(climb.type)} AND "
            f"(SELECT grade FROM climbs WHERE id={climb_id})={climb.grade} "
            "THEN 1 ELSE 0 END;",
            "DELETE FROM openbeta_climb_move_guard;",
            f"UPDATE climbs SET area_id={target_area} WHERE id={climb_id} AND area_id={old_area};",
        ])
    sql.append("DROP TABLE openbeta_climb_move_guard;")
    return "\n".join(sql) + "\n"


def plan_reviewed_final_route_links(matcher: Reconciler, decisions: list[dict],
                                    new: list[dict], source_rows: list[tuple]
                                    ) -> tuple[str, int]:
    """Replace only freshly inserted duplicate climbs with original climb IDs."""
    originals = {climb.id: climb for climb in matcher.climbs}
    inserted = {int(item["betabook_id"]): item for item in new}
    source_by_id = {row[1]: row for row in source_rows}
    linked_source_counts = Counter(row[2] for row in source_rows if row[9] == "new")
    seen_new: set[int] = set()
    seen_original: set[int] = set()
    sql = ["CREATE TABLE openbeta_route_link_guard (ok INTEGER NOT NULL CHECK(ok=1));"]

    def quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    for decision in decisions:
        old_id, new_id = int(decision["original_climb_id"]), int(decision["new_climb_id"])
        old, fresh = originals.get(old_id), inserted.get(new_id)
        source = source_by_id.get(decision["openbeta_id"])
        relation = decision["relationship"]
        if (not old or not fresh or not source or source[2] != new_id or source[9] != "new"
                or source[6] != decision["source_path"]
                or new_id in seen_new or old_id in seen_original
                or old.name != decision["original_name"] or fresh["openbeta_name"] != decision["new_name"]
                or old.type != decision["type"] or fresh["type"] != decision["type"]
                or old.grade != int(decision["original_grade_ordinal"])
                or fresh["grade"] != int(decision["new_grade_ordinal"])
                or abs(old.grade - fresh["grade"]) > 1
                or name_parts(old.name) != name_parts(fresh["openbeta_name"])
                and relation != "reviewed_alias_same_area"
                or is_unnamed_climb(old.name) or relation not in {
                    "same_area", "new_descendant", "old_descendant", "reviewed_cross_branch",
                    "reviewed_cross_branch_keep_original", "reviewed_alias_same_area"}
                or (relation.startswith("reviewed_cross_branch")
                    or relation == "reviewed_alias_same_area") and not decision.get("source_url")):
            raise ValueError(f"Reviewed post-area route identity changed: {old_id} <- {new_id}")
        old_area, new_area = (int(decision["expected_original_area_id"]),
                              int(decision["expected_new_area_id"]))
        if relation in {"same_area", "reviewed_alias_same_area"} and old_area != new_area:
            raise ValueError(f"Reviewed same-area route has different areas: {old_id} <- {new_id}")
        if relation in {"same_area", "reviewed_alias_same_area", "reviewed_cross_branch",
                        "reviewed_cross_branch_keep_original"}:
            hierarchy_guard = "1=1"
        else:
            descendant_id, ancestor_area = ((new_id, old_area) if relation == "new_descendant"
                                             else (old_id, new_area))
            hierarchy_guard = (
                "EXISTS(WITH RECURSIVE ancestry(id) AS ("
                f"SELECT area_id FROM climbs WHERE id={descendant_id} UNION ALL "
                "SELECT areas.parent_id FROM areas JOIN ancestry ON areas.id=ancestry.id "
                "WHERE areas.parent_id IS NOT NULL) "
                f"SELECT 1 FROM ancestry WHERE id={ancestor_area})"
            )
        sql.extend([
            "INSERT INTO openbeta_route_link_guard (ok) SELECT CASE WHEN "
            f"EXISTS(SELECT 1 FROM climbs WHERE id={old_id} AND area_id={old_area} "
            f"AND name={quote(old.name)} AND type={quote(old.type)} AND grade={old.grade}) AND "
            f"EXISTS(SELECT 1 FROM climbs WHERE id={new_id} AND area_id={new_area} "
            f"AND name={quote(fresh['openbeta_name'])} AND type={quote(fresh['type'])} "
            f"AND grade={fresh['grade']} AND description IS NULL AND send_count=0 "
            "AND rating_count=0) AND "
            f"EXISTS(SELECT 1 FROM catalog_route_sources WHERE source='openbeta' "
            f"AND source_id={quote(decision['openbeta_id'])} AND climb_id={new_id} "
            "AND status='new') AND "
            f"NOT EXISTS(SELECT 1 FROM catalog_route_sources WHERE climb_id={new_id} "
            "AND status!='new') AND "
            f"NOT EXISTS(SELECT 1 FROM sends WHERE climb_id={new_id}) AND "
            f"NOT EXISTS(SELECT 1 FROM journal_entries WHERE climb_id={new_id}) AND "
            f"NOT EXISTS(SELECT 1 FROM change_requests WHERE entity_id={new_id} "
            "AND status='pending' AND type IN ('climb_edit','climb_delete','climb_move',"
            "'climb_merge','climb_break')) AND "
            f"{hierarchy_guard} THEN 1 ELSE 0 END;",
            "DELETE FROM openbeta_route_link_guard;",
        ])
        if relation in {"new_descendant", "reviewed_cross_branch"}:
            sql.append(f"UPDATE climbs SET area_id={new_area} WHERE id={old_id} AND area_id={old_area};")
        match_kind = ("reviewed_cross_branch_route" if relation.startswith("reviewed_cross_branch")
                      else "reviewed_name_alias_route" if relation == "reviewed_alias_same_area"
                      else "reviewed_post_area_merge")
        sql.extend([
            "UPDATE catalog_route_sources SET "
            f"climb_id={old_id},status='matched',match_kind={quote(match_kind)},"
            f"match_score=100 WHERE climb_id={new_id} AND status='new';",
            f"DELETE FROM climbs WHERE id={new_id};",
        ])
        seen_new.add(new_id)
        seen_original.add(old_id)
    sql.append("DROP TABLE openbeta_route_link_guard;")
    return "\n".join(sql) + "\n", sum(linked_source_counts[new_id] for new_id in seen_new)


def correct_wrong_area_anchors(matcher: Reconciler, matched: list[dict], new: list[dict],
                               review: list[dict], unsupported: list[dict]) -> list[dict]:
    """Use several accepted routes to reject an unrelated same-name area."""
    by_path: dict[str, list[dict]] = defaultdict(list)
    for item in matched:
        by_path[item["openbeta_path"]].append(item)
    location_by_text = {" > ".join(x for x in location if x): location
                        for location in matcher.location_map}
    decisions = []
    for source_path, items in sorted(by_path.items()):
        location = location_by_text.get(source_path)
        if location is None or len({item["betabook_id"] for item in items}) < 2:
            continue
        mapped, _ = matcher.location_map[location]
        if matcher.areas[mapped].new:
            continue
        terminal_index = max((index for index in range(2, len(location)) if location[index]), default=1)
        if terminal_index <= 2:
            continue
        prefix_location = location[:terminal_index] + ("",) * (len(location) - terminal_index)
        parent, parent_quality = matcher.resolve_location(prefix_location)
        if (parent_quality in {"ambiguous_anchor", "state_only"}
                or matcher.areas[parent].new or len(matcher.path(parent)) < 4
                or parent in matcher.path(mapped) or mapped in matcher.path(parent)):
            continue
        parent_path = matcher.path(parent)
        if any(matcher.path(item["betabook_current_area_id"]) != parent_path
               for item in items):
            continue
        segments = source_area_segments(location[2:], location[1])
        if not segments or area_norm(segments[-1]) == area_norm(matcher.areas[parent].name):
            continue
        # The exact source leaf is more specific than the corroborated old
        # parent. Keep an unrelated same-named original area in its own branch.
        corrected = matcher.get_child(parent, segments[-1])
        if corrected == mapped:
            continue
        old_path = " > ".join(matcher.path_names(mapped))
        new_path = " > ".join(matcher.path_names(corrected))
        matcher.location_map[location] = (corrected, "route_evidence_corrected_anchor")
        reassigned_new = 0
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["openbeta_path"] != source_path:
                    continue
                item["betabook_area_id"] = corrected
                item["betabook_area_path"] = new_path
                item["area_quality"] = "route_evidence_corrected_anchor"
                if collection is new:
                    reassigned_new += 1
        for item in items:
            item["move_to_area"] = corrected
        decisions.append({
            "openbeta_path": source_path, "wrong_area_id": mapped,
            "wrong_area_path": old_path, "corrected_area_id": corrected,
            "corrected_area_path": new_path, "matched_routes": len(items),
            "new_routes_reassigned": reassigned_new,
        })
    return decisions


def force_reviewed_source_branches(matcher: Reconciler, decisions: list[dict],
                                   matched: list[dict], new: list[dict], review: list[dict],
                                   unsupported: list[dict]) -> list[dict]:
    """Apply exact, reviewed source branches where a leaf-name anchor was wrong."""
    location_by_text = {" > ".join(x for x in location if x): location
                        for location in matcher.location_map}
    applied = []
    for decision in decisions:
        source_path = decision["openbeta_path"]
        location = location_by_text.get(source_path)
        if location is None:
            raise ValueError(f"Reviewed source branch is missing: {source_path}")
        country, state = location[:2]
        root = matcher.get_root(COUNTRY_CONTINENTS.get(country, "Uncategorized"))
        if root is None:
            raise ValueError(f"Missing continent root for reviewed branch: {source_path}")
        country_id = matcher.get_child(root, country)
        state_id = matcher.get_child(country_id, canonical_state(country, state)) if state else country_id
        segments = source_area_segments(location[2:], canonical_state(country, state))
        if not segments:
            raise ValueError(f"Reviewed source branch has no named area: {source_path}")
        if decision.get("parent_existing_area_id"):
            parent = int(decision["parent_existing_area_id"])
            consumed = int(decision["source_parent_segment_count"])
            if (parent > matcher.base_area_max or matcher.path(parent)[:3] != matcher.path(state_id)[:3]
                    or not 0 < consumed < len(segments)):
                raise ValueError(f"Invalid reviewed source parent alias: {source_path}")
            remaining = segments[consumed:]
        elif decision.get("override_parent_source_path"):
            parent_parts = decision["override_parent_source_path"].split(" > ")
            if not 2 <= len(parent_parts) <= 5:
                raise ValueError(f"Invalid reviewed source parent path: {source_path}")
            parent_location = tuple(parent_parts + [""] * (5 - len(parent_parts)))
            parent, quality = matcher.resolve_location(parent_location)
            consumed = int(decision["source_parent_segment_count"])
            if (quality in {"ambiguous_anchor", "state_only"}
                    or matcher.path(parent)[:3] != matcher.path(state_id)[:3]
                    or not 0 < consumed < len(segments)):
                raise ValueError(f"Invalid reviewed source parent override: {source_path}")
            remaining = segments[consumed:]
        else:
            aliases = [(root, prefix) for root, prefix in matcher.reviewed_area_aliases.items()
                       if source_path == prefix or source_path.startswith(prefix + " > ")]
            alias = max(aliases, key=lambda entry: len(entry[1]), default=None)
            if alias:
                parent, prefix = alias
                consumed = len(source_area_segments(prefix.split(" > ")[2:],
                                                    canonical_state(country, state)))
                remaining = segments[consumed:]
            else:
                parent = state_id
                remaining = segments
        for segment in remaining:
            parent = matcher.get_child(parent, segment)
        corrected = parent
        corrected_path = " > ".join(matcher.path_names(corrected))
        expected_parent = decision["expected_parent_path"]
        if not (corrected_path == expected_parent
                or corrected_path.startswith(expected_parent + " > ")):
            raise ValueError(f"Reviewed source parent changed: {source_path}: {corrected_path}")
        wrong, _ = matcher.location_map[location]
        wrong_path = " > ".join(matcher.path_names(wrong))
        if wrong != corrected and wrong_path != decision["expected_wrong_area_path"]:
            raise ValueError(f"Reviewed wrong area changed: {source_path}: {wrong_path}")
        found_new = sum(item["openbeta_path"] == source_path for item in new)
        if found_new > int(decision["expected_new_routes"]):
            raise ValueError(f"Reviewed source route count increased: {source_path}: {found_new}")
        matcher.location_map[location] = (corrected, "semantic_source_branch")
        for collection in (matched, new, review, unsupported):
            for item in collection:
                if item["openbeta_path"] != source_path:
                    continue
                item["betabook_area_id"] = corrected
                item["betabook_area_path"] = corrected_path
                item["area_quality"] = "semantic_source_branch"
                if (collection is matched
                        and item["betabook_current_area_id"] == matcher.areas[corrected].parent_id):
                    item["move_to_area"] = corrected
        applied.append({
            "openbeta_path": source_path, "wrong_area_id": wrong,
            "wrong_area_path": wrong_path, "corrected_area_id": corrected,
            "corrected_area_path": corrected_path, "new_routes_reassigned": found_new,
            "evidence": decision["evidence"], "confidence": decision["confidence"],
        })
    return applied


def apply_reviewed_area_aliases(matcher: Reconciler, sources: list[dict],
                                decisions: list[dict]
                                ) -> tuple[list[dict], list[tuple[int, int, int]]]:
    """Fold a verified source area into one original area before route matching."""
    applied = []
    reparents = []
    for decision in decisions:
        prefix = decision["openbeta_prefix"]
        parts = prefix.split(" > ")
        if not 3 <= len(parts) <= 5:
            raise ValueError(f"Invalid reviewed area alias prefix: {prefix}")
        location = tuple(parts + [""] * (5 - len(parts)))
        planned, _ = matcher.resolve_location(location)
        original = int(decision["existing_area_id"])
        old_parent = matcher.areas[original].parent_id
        parent = matcher.areas[planned].parent_id
        if (not matcher.areas[planned].new or original > matcher.base_area_max
                or old_parent != int(decision["expected_old_parent_id"])
                or parent is None or matcher.path(original)[:3] != matcher.path(planned)[:3]
                or " > ".join(matcher.path_names(planned)) != decision["expected_planned_area_path"]):
            raise ValueError(f"Reviewed area alias changed: {prefix}")

        original_names: dict[tuple[str, str, str], list[Climb]] = defaultdict(list)
        for climb in matcher.climbs:
            if original in matcher.path(climb.area_id):
                core, variant = name_parts(climb.name)
                original_names[(core, variant, climb.type)].append(climb)
        corroborated = set()
        for source in sources:
            source_path = " > ".join(value for value in matcher.location(source) if value)
            if not (source_path == prefix or source_path.startswith(prefix + " > ")):
                continue
            types = source_types(source)
            if (len(types) != 1 or is_unnamed_climb(source["climb_name"])
                    or is_ungraded_source(source)):
                continue
            grade, _, _ = parse_grade(types[0], source["grade_vscale"], source["grade_yds"])
            if grade is None:
                continue
            core, variant = name_parts(source["climb_name"])
            candidates = [climb for climb in original_names[(core, variant, types[0])]
                          if climb.grade is not None and abs(grade - climb.grade) <= 1]
            if len(candidates) == 1:
                corroborated.add(candidates[0].id)
        if len(corroborated) < int(decision["minimum_exact_route_overlaps"]):
            raise ValueError(f"Reviewed area alias lost route evidence: {prefix}: {len(corroborated)}")

        affected = {}
        for source_location, (mapped, _) in matcher.location_map.items():
            if planned not in matcher.path(mapped):
                continue
            source_path = " > ".join(value for value in source_location if value)
            if not (source_path == prefix or source_path.startswith(prefix + " > ")):
                raise ValueError(f"Reviewed area alias has a foreign source path: {source_path}")
            affected[source_location] = mapped

        preserve_parent = decision.get("preserve_existing_parent", "").casefold() == "true"
        if old_parent != parent and not preserve_parent:
            prior = matcher.reparent_area(original, parent)
            reparents.append((original, prior, parent))
        redirects = {planned: original}

        def fold(planning_id: int, survivor_id: int) -> None:
            children = [area.id for area in matcher.areas.values() if area.parent_id == planning_id]
            for child_id in children:
                child = matcher.areas[child_id]
                if not child.new:
                    raise ValueError(f"Reviewed area alias includes an original child: {child_id}")
                same_name = [area.id for area in matcher.areas.values()
                             if area.parent_id == survivor_id and area.id != child_id
                             and norm(area.name) == norm(child.name)]
                if len(same_name) > 1:
                    raise ValueError(f"Reviewed area alias has ambiguous child: {child_id}")
                if same_name:
                    redirects[child_id] = same_name[0]
                    fold(child_id, same_name[0])
                else:
                    matcher.reparent_area(child_id, survivor_id)

        fold(planned, original)
        for source_location, mapped in affected.items():
            matcher.location_map[source_location] = (redirects.get(mapped, mapped), "reviewed_area_alias")
        matcher.reviewed_area_aliases[original] = prefix
        applied.append({
            "openbeta_prefix": prefix, "existing_area_id": original,
            "source_planning_area_id": planned,
            "original_area_path": " > ".join(matcher.path_names(original)),
            "corroborating_original_climbs": len(corroborated),
            "folded_planning_areas": len(redirects),
            "source_paths_reassigned": len(affected),
            "original_parent_preserved": preserve_parent,
            "evidence": decision["evidence"], "source_url": decision["source_url"],
        })
    return applied, reparents


def apply_reviewed_parent_moves(matcher: Reconciler, decisions: list[dict],
                                area_reparents: list[tuple[int, int, int]]) -> list[dict]:
    """Apply agent-reviewed geographic containment without guessing from names."""
    applied = []
    for decision in decisions:
        area_id = int(decision["area_id"])
        if area_id > matcher.base_area_max:
            raise ValueError(f"Reviewed parent move must keep an original area ID: {area_id}")
        if decision["parent_existing_area_id"]:
            parent = int(decision["parent_existing_area_id"])
        else:
            parts = decision["parent_source_path"].split(" > ")
            if not 2 <= len(parts) <= 5:
                raise ValueError(f"Invalid reviewed parent source path: {decision['parent_source_path']}")
            location = tuple(parts + [""] * (5 - len(parts)))
            parent, quality = matcher.resolve_location(location)
            if quality in {"ambiguous_anchor", "state_only"}:
                raise ValueError(f"Reviewed parent path did not resolve: {decision['parent_source_path']}")
        parent_path = " > ".join(matcher.path_names(parent))
        if parent_path != decision["expected_parent_path"]:
            raise ValueError(f"Reviewed parent path changed for {area_id}: {parent_path}")
        current_parent = matcher.areas[area_id].parent_id
        if current_parent == parent:
            continue
        if current_parent != int(decision["expected_old_parent_id"]):
            raise ValueError(f"Reviewed original parent changed for {area_id}: {current_parent}")
        if matcher.path(area_id)[:3] != matcher.path(parent)[:3]:
            raise ValueError(f"Reviewed parent changes country or state: {area_id}")
        old_path = " > ".join(matcher.path_names(area_id))
        old_parent = matcher.reparent_area(area_id, parent)
        area_reparents.append((area_id, old_parent, parent))
        applied.append({
            "openbeta_path": decision["parent_source_path"],
            "existing_area_id": area_id, "original_area_path": old_path,
            "resolved_area_path": " > ".join(matcher.path_names(area_id)),
            "action": "reviewed_parent_move", "old_parent_id": old_parent,
            "new_parent_id": parent, "matched_routes": "", "new_routes_reassigned": "",
        })
    return applied


def nearby_same_name_source_pairs(new: list[dict], source_by_uuid: dict[str, dict]) -> tuple[list[dict], set[str]]:
    """Find same-name source climbs at nearby different paths before insertion."""
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for item in new:
        source = source_by_uuid[item["openbeta_id"]]
        core, variant = name_parts(source["climb_name"])
        country, state, *_ = (COUNTRY_NAMES.get(source["country"], source["country"]),
                              source["state_province"])
        geo = (norm(country), norm(canonical_state(country, state)))
        groups[(geo, item["type"], core, variant)].append(item)

    def distance_km(first: dict, second: dict) -> float:
        lat1, lon1 = math.radians(first["latitude"]), math.radians(first["longitude"])
        lat2, lon2 = math.radians(second["latitude"]), math.radians(second["longitude"])
        value = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
        return 12742 * math.asin(min(1, math.sqrt(value)))

    pairs = []
    held = set()
    for (_, _, _, _), items in groups.items():
        cells: dict[tuple[int, int], list[dict]] = defaultdict(list)
        for item in items:
            source = source_by_uuid[item["openbeta_id"]]
            lat, lon = source["latitude"], source["longitude"]
            cell_x, cell_y = math.floor(lat * 2), math.floor(lon * 2)
            lon_range = min(10, 1 + math.ceil(20 / max(1, 111 * abs(math.cos(math.radians(lat)))) / 0.5))
            for dx in (-1, 0, 1):
                for dy in range(-lon_range, lon_range + 1):
                    for other in cells.get((cell_x + dx, cell_y + dy), []):
                        if other["openbeta_path"] == item["openbeta_path"]:
                            continue
                        grade, other_grade = item["grade"], other["grade"]
                        if grade is not None and other_grade is not None and abs(grade - other_grade) > 1:
                            continue
                        other_source = source_by_uuid[other["openbeta_id"]]
                        km = distance_km(source, other_source)
                        if km > 20:
                            continue
                        first, second = sorted((item, other), key=lambda row: row["openbeta_id"])
                        pairs.append({
                            "openbeta_id_a": first["openbeta_id"], "openbeta_name_a": first["openbeta_name"],
                            "openbeta_path_a": first["openbeta_path"], "grade_a": first["openbeta_grade"],
                            "openbeta_id_b": second["openbeta_id"], "openbeta_name_b": second["openbeta_name"],
                            "openbeta_path_b": second["openbeta_path"], "grade_b": second["openbeta_grade"],
                            "distance_km": round(km, 2),
                        })
                        held.update((item["openbeta_id"], other["openbeta_id"]))
            cells[(cell_x, cell_y)].append(item)
    pairs.sort(key=lambda row: (row["openbeta_id_a"], row["openbeta_id_b"]))
    return pairs, held


def hold_reviewed_area_paths(matcher: Reconciler, decisions: list[dict],
                             new: list[dict], review: list[dict],
                             payload_aliases_to_new: dict[str, str]) -> tuple[list[dict], int]:
    """Keep new routes out of source paths with reviewed area ambiguity."""
    locations = {" > ".join(x for x in location if x): location
                 for location in matcher.location_map}
    held_rows = []
    held_count = 0
    for decision in decisions:
        path = decision["openbeta_path"]
        location = locations.get(path)
        if location is None:
            # Every route on a reviewed path can become ineligible for import
            # (for example after excluding ungraded routes). Keep the reviewed
            # decision visible without creating an empty source area.
            held_rows.append({
                "openbeta_path": path, "held_new_routes": 0,
                "mapped_area_id": "", "mapped_area_path": "",
                "reason": decision["reason"], "confidence": decision["confidence"],
                "evidence_url": decision["evidence_url"],
            })
            continue
        candidates = [item for item in new if item["openbeta_path"] == path]
        if len(candidates) > int(decision["expected_new_routes"]):
            raise ValueError(f"Reviewed area hold gained routes: {path}")
        for item in candidates:
            review.append(item | {
                "reason": "reviewed_area_hold", "candidate_id": "",
                "candidate_name": "", "candidate_path": "", "score": "",
            })
            for alias_uuid, representative in list(payload_aliases_to_new.items()):
                if representative == item["openbeta_id"]:
                    review.append(item | {
                        "openbeta_id": alias_uuid, "reason": "reviewed_area_hold",
                        "candidate_id": "", "candidate_name": "",
                        "candidate_path": "", "score": "",
                    })
                    del payload_aliases_to_new[alias_uuid]
                    held_count += 1
        new[:] = [item for item in new if item["openbeta_path"] != path]
        area_id, _ = matcher.location_map[location]
        matcher.location_map[location] = (area_id, "reviewed_area_hold")
        held_count += len(candidates)
        held_rows.append({
            "openbeta_path": path, "held_new_routes": len(candidates),
            "mapped_area_id": area_id, "mapped_area_path": " > ".join(matcher.path_names(area_id)),
            "reason": decision["reason"], "confidence": decision["confidence"],
            "evidence_url": decision["evidence_url"],
        })
    return held_rows, held_count


def hold_route_evidence_area_conflicts(matcher: Reconciler, matched: list[dict],
                                       new: list[dict], review: list[dict],
                                       payload_aliases_to_new: dict[str, str]) -> tuple[list[dict], int]:
    """Do not insert new routes where accepted identities contradict placement."""
    by_path: dict[str, list[dict]] = defaultdict(list)
    for item in matched:
        by_path[item["openbeta_path"]].append(item)
    new_by_path: dict[str, list[dict]] = defaultdict(list)
    for item in new:
        new_by_path[item["openbeta_path"]].append(item)
    location_by_text = {" > ".join(x for x in location if x): location
                        for location in matcher.location_map}
    held_rows = []
    held_count = 0
    held_uuids = set()
    for source_path, items in sorted(by_path.items()):
        location = location_by_text.get(source_path)
        if location is None:
            continue
        mapped, _ = matcher.location_map[location]
        mapped_path = matcher.path(mapped)
        unrelated = []
        related = []
        for item in items:
            current = int(item["move_to_area"]) if item.get("move_to_area") else item["betabook_current_area_id"]
            current_path = matcher.path(current)
            (related if (current_path[:len(mapped_path)] == mapped_path
                         or mapped_path[:len(current_path)] == current_path) else unrelated).append(item)
        if not unrelated:
            continue
        candidates = new_by_path.get(source_path, [])
        if not candidates:
            continue
        old_areas = Counter(item["betabook_current_area_id"] for item in unrelated)
        for item in candidates:
            review.append(item | {
                "reason": "route_evidence_area_conflict", "candidate_id": "",
                "candidate_name": "", "candidate_path": "", "score": "",
            })
            for alias_uuid, representative in list(payload_aliases_to_new.items()):
                if representative == item["openbeta_id"]:
                    review.append(item | {
                        "openbeta_id": alias_uuid, "reason": "route_evidence_area_conflict",
                        "candidate_id": "", "candidate_name": "",
                        "candidate_path": "", "score": "",
                    })
                    del payload_aliases_to_new[alias_uuid]
                    held_count += 1
        held_uuids.update(item["openbeta_id"] for item in candidates)
        matcher.location_map[location] = (mapped, "route_evidence_area_conflict")
        held_count += len(candidates)
        held_rows.append({
            "openbeta_path": source_path,
            "mapped_area_id": mapped,
            "mapped_area_path": " > ".join(matcher.path_names(mapped)),
            "unrelated_matched_routes": len(unrelated),
            "related_matched_routes": len(related),
            "held_new_routes": len(candidates),
            "existing_area_ids": "; ".join(str(area_id) for area_id, _ in old_areas.most_common()),
            "existing_area_paths": "; ".join(" > ".join(matcher.path_names(area_id))
                                              for area_id, _ in old_areas.most_common()),
            "sample_matched_names": "; ".join(dict.fromkeys(item["openbeta_name"] for item in unrelated[:5])),
        })
    held_rows.sort(key=lambda item: (-item["held_new_routes"], item["openbeta_path"]))
    if held_uuids:
        new[:] = [item for item in new if item["openbeta_id"] not in held_uuids]
    return held_rows, held_count


def apply_reviewed_route_moves(matcher: Reconciler, decisions: list[dict],
                               matched: list[dict], source_by_uuid: dict[str, dict]
                               ) -> list[dict]:
    """Move an accepted original climb to an independently verified source crag."""
    by_uuid = {item["openbeta_id"]: item for item in matched}
    climbs = {climb.id: climb for climb in matcher.climbs}
    applied = []
    for decision in decisions:
        uuid = decision["openbeta_id"]
        item, source = by_uuid.get(uuid), source_by_uuid.get(uuid)
        climb_id = int(decision["betabook_id"])
        climb = climbs.get(climb_id)
        if (not item or not source or not climb or item["betabook_id"] != climb_id
                or climb.area_id != int(decision["expected_original_area_id"])
                or item["openbeta_path"] != decision["expected_source_path"]
                or not decision["source_url"] or climb.type not in source_types(source)
                or name_parts(source["climb_name"]) != name_parts(climb.name)):
            raise ValueError(f"Reviewed route placement identity changed: {uuid}")
        grade, _, _ = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
        if grade is None or climb.grade is None or abs(grade - climb.grade) > 1:
            raise ValueError(f"Reviewed route placement grade changed: {uuid}")
        location = matcher.location(source)
        target, _ = matcher.location_map[location]
        target_path = " > ".join(matcher.path_names(target))
        if target_path != decision["expected_target_area_path"]:
            raise ValueError(f"Reviewed route destination changed: {uuid}: {target_path}")
        source_path = item["openbeta_path"]
        if not any(
                (source_path == prefix or source_path.startswith(prefix + " > "))
                and root in matcher.path(target) and root in matcher.path(climb.area_id)
                for root, prefix in matcher.reviewed_area_aliases.items()):
            raise ValueError(f"Reviewed route placement crosses an unreviewed area: {uuid}")
        if target == climb.area_id:
            raise ValueError(f"Reviewed route placement is already exact: {uuid}")
        item["move_to_area"] = target
        item["betabook_area_id"] = target
        item["betabook_area_path"] = target_path
        item["area_quality"] = "reviewed_route_move"
        applied.append({
            "openbeta_id": uuid, "betabook_id": climb_id,
            "original_area_id": climb.area_id,
            "original_area_path": " > ".join(matcher.path_names(climb.area_id)),
            "target_area_id": target, "target_area_path": target_path,
            "evidence": decision["evidence"], "source_url": decision["source_url"],
        })
    return applied


def mark_reviewed_source_parent_conflicts(matcher: Reconciler, decisions: list[dict],
                                          collections: tuple[list[dict], ...]
                                          ) -> list[dict]:
    """Flag a false OpenBeta parent while keeping its correctly located leaf."""
    applied = []
    for decision in decisions:
        prefix = decision["openbeta_prefix"]
        anchor = int(decision["existing_area_id"])
        affected = set()
        for location, (mapped, _) in list(matcher.location_map.items()):
            source_path = " > ".join(value for value in location if value)
            if not (source_path == prefix or source_path.startswith(prefix + " > ")):
                continue
            if anchor not in matcher.path(mapped):
                raise ValueError(f"Reviewed source-parent conflict changed area: {source_path}")
            matcher.location_map[location] = (mapped, "source_parent_conflict")
            affected.add(source_path)
        if not affected:
            raise ValueError(f"Reviewed source-parent conflict lost paths: {prefix}")
        for collection in collections:
            for item in collection:
                if item["openbeta_path"] in affected:
                    item["area_quality"] = "source_parent_conflict"
        applied.append({
            "openbeta_prefix": prefix, "existing_area_id": anchor,
            "affected_source_paths": len(affected), "reason": decision["reason"],
            "evidence_url": decision["evidence_url"],
        })
    return applied


def run(catalog_sql: Path, parquet: Path, output: Path, release: str,
        audit_candidates: Path | None = None,
        audited_promotions: Path | None = None,
        distinct_crags: Path | None = None,
        subarea_corroborations: Path | None = None,
        area_placement_exceptions: Path | None = None,
        reviewed_source_branches: Path | None = None,
        reviewed_area_alignments: Path | None = None,
        reviewed_parent_moves: Path | None = None,
        rejected_matches: Path | None = None,
        reviewed_area_holds: Path | None = None,
        reviewed_new_releases: Path | None = None,
        reviewed_area_aliases: Path | None = None,
        reviewed_pre_match_parent_moves: Path | None = None,
        reviewed_route_moves: Path | None = None,
        reviewed_source_parent_conflicts: Path | None = None,
        reviewed_original_area_merges: Path | None = None,
        reviewed_final_parent_moves: Path | None = None,
        reviewed_final_climb_moves: Path | None = None,
        reviewed_final_source_area_alignments: Path | None = None,
        reviewed_final_route_links: Path | None = None,
        reviewed_final_semantic: Path | None = None) -> None:
    output.mkdir(parents=True, exist_ok=True)
    matcher = Reconciler(catalog_sql)
    sources = load_source(parquet)
    decoded_text_fields = decode_source_text(sources)
    source_by_uuid = {source["climb_id"]: source for source in sources}
    curation: dict[str, list[dict]] = defaultdict(list)
    if audit_candidates:
        for item in csv.DictReader(audit_candidates.open()):
            if item["verdict"] not in {"likely_same", "uncertain", "distinct_variant"}:
                raise ValueError(f"Unknown audit verdict: {item['verdict']}")
            curation[item["openbeta_id"]].append(item)
        missing = set(curation) - {source["climb_id"] for source in sources}
        if missing:
            raise ValueError(f"Audit refers to unknown OpenBeta UUIDs: {sorted(missing)[:3]}")
    promotion_rows = list(csv.DictReader(audited_promotions.open())) if audited_promotions else []
    if len({row["openbeta_id"] for row in promotion_rows}) != len(promotion_rows):
        raise ValueError("Audited promotions repeat an OpenBeta UUID")
    distinct_rows = list(csv.DictReader(distinct_crags.open())) if distinct_crags else []
    if len({row["openbeta_id"] for row in distinct_rows}) != len(distinct_rows):
        raise ValueError("Distinct-crag release repeats an OpenBeta UUID")
    subarea_rows = list(csv.DictReader(subarea_corroborations.open())) if subarea_corroborations else []
    if len({row["openbeta_id"] for row in subarea_rows}) != len(subarea_rows):
        raise ValueError("Subarea corroboration repeats an OpenBeta UUID")
    placement_rows = list(csv.DictReader(area_placement_exceptions.open())) if area_placement_exceptions else []
    if len({row["openbeta_path"] for row in placement_rows}) != len(placement_rows):
        raise ValueError("Area placement exceptions repeat an OpenBeta path")
    placement_exceptions = {row["openbeta_path"]: int(row["existing_area_id"])
                            for row in placement_rows}
    source_branch_rows = list(csv.DictReader(reviewed_source_branches.open())) if reviewed_source_branches else []
    if len({row["openbeta_path"] for row in source_branch_rows}) != len(source_branch_rows):
        raise ValueError("Reviewed source branches repeat an OpenBeta path")
    alignment_rows = list(csv.DictReader(reviewed_area_alignments.open())) if reviewed_area_alignments else []
    if len({row["openbeta_path"] for row in alignment_rows}) != len(alignment_rows):
        raise ValueError("Reviewed area alignments repeat an OpenBeta path")
    parent_move_rows = list(csv.DictReader(reviewed_parent_moves.open())) if reviewed_parent_moves else []
    if len({row["area_id"] for row in parent_move_rows}) != len(parent_move_rows):
        raise ValueError("Reviewed parent moves repeat a Betabook area ID")
    rejection_rows = list(csv.DictReader(rejected_matches.open())) if rejected_matches else []
    if len({row["openbeta_id"] for row in rejection_rows}) != len(rejection_rows):
        raise ValueError("Reviewed match rejections repeat an OpenBeta UUID")
    area_hold_input = list(csv.DictReader(reviewed_area_holds.open())) if reviewed_area_holds else []
    if len({row["openbeta_path"] for row in area_hold_input}) != len(area_hold_input):
        raise ValueError("Reviewed area holds repeat an OpenBeta path")
    new_release_rows = list(csv.DictReader(reviewed_new_releases.open())) if reviewed_new_releases else []
    if len({row["openbeta_id"] for row in new_release_rows}) != len(new_release_rows):
        raise ValueError("Reviewed new releases repeat an OpenBeta UUID")
    alias_rows = list(csv.DictReader(reviewed_area_aliases.open())) if reviewed_area_aliases else []
    if len({row["openbeta_prefix"] for row in alias_rows}) != len(alias_rows):
        raise ValueError("Reviewed area aliases repeat an OpenBeta prefix")
    early_parent_rows = (list(csv.DictReader(reviewed_pre_match_parent_moves.open()))
                         if reviewed_pre_match_parent_moves else [])
    if len({row["area_id"] for row in early_parent_rows}) != len(early_parent_rows):
        raise ValueError("Pre-match parent moves repeat a Betabook area ID")
    if {row["area_id"] for row in early_parent_rows} & {row["area_id"] for row in parent_move_rows}:
        raise ValueError("An area has both early and late reviewed parent moves")
    route_move_rows = list(csv.DictReader(reviewed_route_moves.open())) if reviewed_route_moves else []
    if len({row["openbeta_id"] for row in route_move_rows}) != len(route_move_rows):
        raise ValueError("Reviewed route moves repeat an OpenBeta UUID")
    parent_conflict_rows = (list(csv.DictReader(reviewed_source_parent_conflicts.open()))
                            if reviewed_source_parent_conflicts else [])
    if len({row["openbeta_prefix"] for row in parent_conflict_rows}) != len(parent_conflict_rows):
        raise ValueError("Reviewed source-parent conflicts repeat an OpenBeta prefix")
    original_area_merge_rows = (list(csv.DictReader(reviewed_original_area_merges.open()))
                                if reviewed_original_area_merges else [])
    if len({row["duplicate_area_id"] for row in original_area_merge_rows}) != len(original_area_merge_rows):
        raise ValueError("Reviewed original-area merges repeat a duplicate area ID")
    final_parent_move_rows = (list(csv.DictReader(reviewed_final_parent_moves.open()))
                              if reviewed_final_parent_moves else [])
    if len({row["area_id"] for row in final_parent_move_rows}) != len(final_parent_move_rows):
        raise ValueError("Reviewed final parent moves repeat an area ID")
    final_climb_move_rows = (list(csv.DictReader(reviewed_final_climb_moves.open()))
                             if reviewed_final_climb_moves else [])
    if len({row["climb_id"] for row in final_climb_move_rows}) != len(final_climb_move_rows):
        raise ValueError("Reviewed final climb moves repeat a climb ID")
    final_source_area_rows = (list(csv.DictReader(reviewed_final_source_area_alignments.open()))
                              if reviewed_final_source_area_alignments else [])
    if len({row["source_path"] for row in final_source_area_rows}) != len(final_source_area_rows):
        raise ValueError("Reviewed final source-area alignments repeat a source path")
    final_route_link_rows = (list(csv.DictReader(reviewed_final_route_links.open()))
                             if reviewed_final_route_links else [])
    semantic_checks = (json.loads(reviewed_final_semantic.read_text())
                       if reviewed_final_semantic else None)
    semantic_sql_file = (Path(semantic_checks["sql"]) if semantic_checks else None)
    if semantic_sql_file and not semantic_sql_file.is_file():
        raise ValueError(f"Missing reviewed final semantic SQL: {semantic_sql_file}")
    if len({row["new_climb_id"] for row in final_route_link_rows}) != len(final_route_link_rows):
        raise ValueError("Reviewed final route links repeat a new climb ID")
    for source in sources:
        if (source["climb_name"] and not is_unnamed_climb(source["climb_name"])
                and not is_ungraded_source(source)):
            matcher.source_names_by_location[matcher.location(source)].add(name_parts(source["climb_name"]))
    locations = sorted({matcher.location(row) for row in sources
                        if source_types(row) and row["climb_name"] and row["state_province"]
                        and not is_unnamed_climb(row["climb_name"])
                        and not is_ungraded_source(row)})
    for location in locations:
        matcher.resolve_location(location)
    early_reparents: list[tuple[int, int, int]] = []
    early_parent_decisions = apply_reviewed_parent_moves(matcher, early_parent_rows, early_reparents)
    alias_decisions, alias_reparents = apply_reviewed_area_aliases(matcher, sources, alias_rows)
    matched, new, review, unsupported, grade_rows = [], [], [], [], []
    source_identity = defaultdict(list)
    for row in sources:
        location = matcher.location(row)
        mapped_id, area_quality = matcher.location_map.get(location, (0, "unsupported"))
        types = source_types(row)
        base = {
            "openbeta_id": row["climb_id"], "openbeta_name": row["climb_name"],
            "openbeta_path": " > ".join(x for x in location if x),
            "betabook_area_id": mapped_id,
            "betabook_area_path": " > ".join(matcher.path_names(mapped_id)) if mapped_id else "",
            "area_quality": area_quality,
            "openbeta_types": ",".join(types),
            "openbeta_grade": row["grade_vscale"] if "boulder" in types else row["grade_yds"],
        }
        if is_unnamed_climb(row["climb_name"]):
            unsupported.append(base | {"reason": "unnamed_route_ignored"})
            continue
        if is_ungraded_source(row):
            unsupported.append(base | {"reason": "ungraded_route_ignored"})
            continue
        if not row["climb_name"] or not name_parts(row["climb_name"])[0] or not types or not row["state_province"]:
            unsupported.append(base | {"reason": "missing_name_type_or_state"})
            continue
        decision, candidate, reason, score = matcher.decide(row, mapped_id)
        if decision == "match":
            assert candidate is not None
            prod_path = matcher.path(candidate.area_id)
            source_path = matcher.path(mapped_id)
            move = (source_path[: len(prod_path)] == prod_path and len(source_path) > len(prod_path)
                    and area_quality in {"aligned", "aligned_skipped_prefix", "reviewed_area_alias"})
            matched.append(base | {"betabook_id": candidate.id, "betabook_name": candidate.name,
                                   "betabook_current_area_id": candidate.area_id,
                                   "betabook_current_path": " > ".join(matcher.path_names(candidate.area_id)),
                                   "score": round(score, 1), "match_kind": reason, "move_to_area": mapped_id if move else ""})
            continue
        if decision == "review":
            review.append(base | {"reason": reason, "candidate_id": candidate.id if candidate else "",
                                  "candidate_name": candidate.name if candidate else "",
                                  "candidate_path": " > ".join(matcher.path_names(candidate.area_id)) if candidate else "",
                                  "score": round(score, 1)})
            continue
        if area_quality in {"ambiguous_anchor", "state_only"}:
            review.append(base | {"reason": "ambiguous_area_anchor" if area_quality == "ambiguous_anchor" else "state_only_location", "candidate_id": "",
                                  "candidate_name": "", "candidate_path": "", "score": ""})
            continue
        aka_candidate = matcher.aka_base_candidate(row, mapped_id)
        if aka_candidate:
            review.append(base | {"reason": "explicit_aka_base_candidate", "candidate_id": aka_candidate.id,
                                  "candidate_name": aka_candidate.name,
                                  "candidate_path": " > ".join(matcher.path_names(aka_candidate.area_id)), "score": ""})
            continue
        same_name = matcher.same_name_region_candidate(row)
        if same_name:
            review.append(base | {"reason": "same_name_in_region", "candidate_id": same_name.id,
                                  "candidate_name": same_name.name,
                                  "candidate_path": " > ".join(matcher.path_names(same_name.area_id)), "score": ""})
            continue
        country_name = matcher.same_name_country_candidate(row, mapped_id)
        if country_name:
            review.append(base | {"reason": "same_name_country_area", "candidate_id": country_name.id,
                                  "candidate_name": country_name.name,
                                  "candidate_path": " > ".join(matcher.path_names(country_name.area_id)), "score": ""})
            continue
        state_fuzzy = matcher.same_area_state_fuzzy_candidate(row, mapped_id)
        if state_fuzzy:
            review.append(base | {"reason": "near_name_state_area", "candidate_id": state_fuzzy.id,
                                  "candidate_name": state_fuzzy.name,
                                  "candidate_path": " > ".join(matcher.path_names(state_fuzzy.area_id)), "score": ""})
            continue
        if len(types) != 1:
            unsupported.append(base | {"reason": "ambiguous_or_unsupported_type"})
            continue
        incompatible = matcher.incompatible_type_candidate(row, mapped_id)
        if incompatible:
            review.append(base | {"reason": "same_route_name_different_type", "candidate_id": incompatible.id,
                                  "candidate_name": incompatible.name,
                                  "candidate_path": " > ".join(matcher.path_names(incompatible.area_id)), "score": ""})
            continue
        climb_type = types[0]
        grade, raw_grade, grade_quality = parse_grade(climb_type, row["grade_vscale"], row["grade_yds"])
        if grade is None:
            unsupported.append(base | {"reason": "unrepresentable_grade_ignored"})
            continue
        core, variant = name_parts(row["climb_name"])
        key = (location[:3], loose_core(core), variant, climb_type) if location[2] else (location, loose_core(core), variant, climb_type)
        source_identity[key].append(row["climb_id"])
        new.append(base | {"betabook_id": matcher.next_climb_id, "type": climb_type,
                           "grade": grade, "grade_quality": grade_quality,
                           "description": (row["description"] or "").strip() or None})
        matcher.next_climb_id += 1
        if grade_quality not in {"exact", "missing"}:
            grade_rows.append({"openbeta_id": row["climb_id"], "name": row["climb_name"],
                               "original_grade": raw_grade, "betabook_grade": grade,
                               "quality": grade_quality})

    # Distinct OpenBeta UUIDs with the same route name and start variant in one
    # named region are too risky to insert as separate climbs automatically.
    duplicate_uuids = {uuid for ids in source_identity.values() if len(ids) > 1 for uuid in ids}
    if duplicate_uuids:
        remaining = []
        for item in new:
            if item["openbeta_id"] in duplicate_uuids:
                review.append(item | {"reason": "same_name_in_openbeta_region", "candidate_id": "", "candidate_name": "", "candidate_path": "", "score": ""})
            else:
                remaining.append(item)
        new = remaining
        # Reassign contiguous deterministic IDs after excluding source duplicates.
        for ident, item in enumerate(new, matcher.base_climb_max + 1):
            item["betabook_id"] = ident

    # One Betabook ID cannot silently stand for several distinct OpenBeta UUIDs.
    matched_counts = Counter(item["betabook_id"] for item in matched)
    accepted_matches = []
    for item in matched:
        if matched_counts[item["betabook_id"]] > 1:
            review.append(item | {"reason": "multiple_source_ids_for_existing_climb",
                                  "candidate_id": item["betabook_id"],
                                  "candidate_name": item["betabook_name"],
                                  "candidate_path": item["betabook_current_path"]})
        else:
            accepted_matches.append(item)
    matched = accepted_matches
    accepted_by_uuid = {item["openbeta_id"]: item for item in matched}
    rejected_uuids = set()
    for row in rejection_rows:
        uuid, candidate_id = row["openbeta_id"], int(row["betabook_id"])
        item = accepted_by_uuid.get(uuid)
        if not item or item["betabook_id"] != candidate_id:
            raise ValueError(f"Reviewed false match changed: {uuid}")
        review.append(item | {
            "reason": "reviewed_false_match", "candidate_id": candidate_id,
            "candidate_name": item["betabook_name"],
            "candidate_path": item["betabook_current_path"],
        })
        rejected_uuids.add(uuid)
    matched = [item for item in matched if item["openbeta_id"] not in rejected_uuids]
    subarea_grouped: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for row in subarea_rows:
        subarea_grouped[(row["openbeta_path"], int(row["existing_area_id"]))].append(row)
    review_by_uuid = {item["openbeta_id"]: item for item in review}
    matched_ids = {item["betabook_id"] for item in matched}
    subarea_reparents = []
    subarea_promoted_ids = set()
    for (path, area_id), rows in sorted(subarea_grouped.items()):
        location = next((location for location in matcher.location_map
                         if " > ".join(value for value in location if value) == path), None)
        if not location or len(rows) < 2 or area_id > matcher.base_area_max:
            raise ValueError(f"Subarea evidence is incomplete: {path}")
        mapped_id, quality = matcher.location_map[location]
        old_parent = matcher.areas[area_id].parent_id
        if (old_parent is None or old_parent not in matcher.path(mapped_id)
                or area_id in matcher.path(mapped_id)
                or any(area.parent_id == area_id for area in matcher.areas.values())):
            raise ValueError(f"Subarea parent is not a safe insertion: {path}")
        area_climbs = {climb.id for climb in matcher.climbs if climb.area_id == area_id}
        expected_ids = {int(row["betabook_id"]) for row in rows}
        if area_climbs != expected_ids or expected_ids & matched_ids:
            raise ValueError(f"Subarea routes do not cover one original leaf: {path}")
        gps_points = set()
        prepared = []
        for row in rows:
            uuid, climb_id = row["openbeta_id"], int(row["betabook_id"])
            item, source = review_by_uuid.get(uuid), source_by_uuid.get(uuid)
            climb = next((climb for climb in matcher.climbs if climb.id == climb_id), None)
            if (not item or not source or not climb
                    or item["reason"] != "ambiguous_or_weak_match"
                    or item["openbeta_path"] != path
                    or int(item.get("candidate_id") or 0) != climb_id
                    or climb.area_id != area_id
                    or source_types(source) != (climb.type,)
                    or name_parts(source["climb_name"]) != name_parts(climb.name)):
                raise ValueError(f"Subarea route evidence changed: {uuid}")
            grade, _, grade_quality = parse_grade(climb.type, source["grade_vscale"], source["grade_yds"])
            if grade_quality != "exact" or grade != climb.grade:
                raise ValueError(f"Subarea route grade disagrees: {uuid}")
            gps_points.add((source["latitude"], source["longitude"]))
            prepared.append((item, climb))
        if len(gps_points) != 1:
            raise ValueError(f"Subarea corroboration has conflicting GPS: {path}")
        original_path = " > ".join(matcher.path_names(area_id))
        old_parent = matcher.reparent_area(area_id, mapped_id)
        subarea_reparents.append((area_id, old_parent, mapped_id))
        for item, climb in prepared:
            matched.append(item | {
                "betabook_id": climb.id, "betabook_name": climb.name,
                "betabook_current_area_id": climb.area_id,
                "betabook_current_path": original_path,
                "match_kind": "corroborated_subarea_routes", "move_to_area": "",
                "betabook_area_id": area_id,
                "betabook_area_path": " > ".join(matcher.path_names(area_id)),
                "area_quality": "route_evidence_subarea",
            })
            subarea_promoted_ids.add(item["openbeta_id"])
            matched_ids.add(climb.id)
    review = [item for item in review if item["openbeta_id"] not in subarea_promoted_ids]
    # An exact source path with accepted original route identities can locate
    # an existing same-named Betabook area. Preserve that area's ID and deeper
    # child hierarchy while inserting a newly evidenced parent above it.
    parallel_targets = parallel_route_targets(matcher, matched)
    area_resolutions, area_reparents, unresolved_parallel_targets = reconcile_parallel_areas(
        matcher, parallel_targets, matched, new, review, unsupported)
    area_reparents = early_reparents + alias_reparents + subarea_reparents + area_reparents
    parallel_targets = unresolved_parallel_targets
    parallel_counts: Counter[str] = Counter()
    kept_new = []
    for item in new:
        target = parallel_targets.get(item["openbeta_path"])
        if (target and matcher.areas[item["betabook_area_id"]].new
                and target not in matcher.path(item["betabook_area_id"])):
            parallel_counts[item["openbeta_path"]] += 1
            review.append(item | {"reason": "parallel_area_with_route_evidence", "candidate_id": "",
                                  "candidate_name": "", "candidate_path": " > ".join(matcher.path_names(target)),
                                  "candidate_area_id": target, "score": ""})
        else:
            kept_new.append(item)
    new = kept_new
    curation_held = 0
    kept_new = []
    climbs_by_id = {climb.id: climb for climb in matcher.climbs}
    for item in new:
        suggestions = [entry for entry in curation.get(item["openbeta_id"], [])
                       if entry["verdict"] in {"likely_same", "uncertain"}]
        if suggestions:
            best = max(suggestions, key=lambda entry:
                       (float(entry["name_similarity"] or 0) + float(entry["area_similarity"] or 0),
                        entry["candidate_id"]))
            candidate = climbs_by_id.get(int(best["candidate_id"])) if best["candidate_id"] else None
            review.append(item | {"reason": "audited_nonoverlap_candidate", "candidate_id": candidate.id if candidate else "",
                                  "candidate_name": candidate.name if candidate else "",
                                  "candidate_path": " > ".join(matcher.path_names(candidate.area_id)) if candidate else "",
                                  "score": ""})
            curation_held += 1
        else:
            kept_new.append(item)
    new = kept_new

    # Distinct UUIDs can carry one byte-identical OpenBeta payload. Resolve
    # only distinctive, single-type groups with one destination; the source
    # crosswalk can keep every UUID against that one physical climb.
    source_by_uuid = {source["climb_id"]: source for source in sources}
    payload_groups: dict[tuple, list[str]] = defaultdict(list)
    identity_members: dict[tuple, set[str]] = defaultdict(set)
    for source in sources:
        uuid = source["climb_id"]
        payload_groups[tuple(value for key, value in source.items() if key != "climb_id")].append(uuid)
        types = source_types(source)
        if len(types) == 1 and source["climb_name"]:
            core, variant = name_parts(source["climb_name"])
            location = matcher.location(source)
            identity = (location[:3], loose_core(core), variant, types[0]) if location[2] else (location, loose_core(core), variant, types[0])
            identity_members[identity].add(uuid)
    review_by_uuid = {item["openbeta_id"]: item for item in review}
    recovered_review_ids = set()
    payload_aliases_to_new: dict[str, str] = {}
    payload_existing_links = []
    for uuids in payload_groups.values():
        if len(uuids) < 2:
            continue
        source = source_by_uuid[uuids[0]]
        core, variant = name_parts(source["climb_name"] or "")
        normalized = loose_core(core)
        if (len(normalized) < 4 or normalized in {"unknown", "unnamed", "project", "problem", "warmup", "theboulder", "redacted", "question"}
                or normalized.startswith(("unknown", "unnamed"))):
            continue
        items = [review_by_uuid.get(uuid) for uuid in uuids]
        if not all(items):
            continue
        reasons = {item["reason"] for item in items}
        candidates = {item.get("candidate_id", "") for item in items}
        if reasons == {"multiple_source_ids_for_existing_climb"} and len(candidates) == 1 and "" not in candidates:
            candidate = climbs_by_id[int(next(iter(candidates)))]
            for item in items:
                payload_existing_links.append(item | {
                    "betabook_id": candidate.id, "betabook_name": candidate.name,
                    "betabook_current_area_id": candidate.area_id,
                    "betabook_current_path": " > ".join(matcher.path_names(candidate.area_id)),
                    "score": "", "match_kind": "exact_payload_existing_alias", "move_to_area": "",
                })
                recovered_review_ids.add(item["openbeta_id"])
            continue
        types = source_types(source)
        if reasons != {"same_name_in_openbeta_region"} or len(types) != 1 or len(normalized) < 6:
            continue
        location = matcher.location(source)
        identity = (location[:3], normalized, variant, types[0]) if location[2] else (location, normalized, variant, types[0])
        if identity_members[identity] != set(uuids):
            continue
        source_grade = source["grade_vscale"] if types[0] == "boulder" else source["grade_yds"]
        if (not source_grade and not (source["description"] or "").strip()
                and normalized in {area_norm(value).replace(" ", "") for value in location[2:] if value}):
            continue
        representative = min(uuids)
        item = review_by_uuid[representative]
        if (item["area_quality"] in {"ambiguous_anchor", "state_only"} or not item["betabook_area_id"]
                or item["openbeta_path"] in parallel_counts
                or any(entry["verdict"] in {"likely_same", "uncertain"} for uuid in uuids for entry in curation.get(uuid, []))):
            continue
        grade, raw_grade, grade_quality = parse_grade(types[0], source["grade_vscale"], source["grade_yds"])
        if grade is None:
            continue
        new.append(item | {"betabook_id": 0, "type": types[0], "grade": grade,
                           "grade_quality": grade_quality,
                           "description": (source["description"] or "").strip() or None})
        if grade_quality not in {"exact", "missing"}:
            grade_rows.append({"openbeta_id": representative, "name": source["climb_name"],
                               "original_grade": raw_grade, "betabook_grade": grade,
                               "quality": grade_quality})
        for uuid in uuids:
            recovered_review_ids.add(uuid)
            if uuid != representative:
                payload_aliases_to_new[uuid] = representative
    review = [item for item in review if item["openbeta_id"] not in recovered_review_ids]
    matched.extend(payload_existing_links)
    review_by_uuid = {item["openbeta_id"]: item for item in review}
    used_climb_ids = {item["betabook_id"] for item in matched}
    promoted_uuids = set()
    promotions_already_accepted = 0
    accepted_by_uuid = {item["openbeta_id"]: item for item in matched}
    for promotion in promotion_rows:
        uuid, climb_id = promotion["openbeta_id"], int(promotion["betabook_id"])
        accepted = accepted_by_uuid.get(uuid)
        if accepted:
            if accepted["betabook_id"] != climb_id:
                raise ValueError(f"Audited promotion now conflicts with an accepted match: {uuid}")
            promotions_already_accepted += 1
            continue
        item = review_by_uuid.get(uuid)
        candidate = climbs_by_id.get(climb_id)
        source = source_by_uuid.get(uuid)
        if (not item or item["reason"] != "ambiguous_or_weak_match" or not candidate or not source
                or int(item.get("candidate_id") or 0) != climb_id or climb_id in used_climb_ids
                or int(promotion["independent_path_support_count"]) < 2):
            raise ValueError(f"Audited promotion no longer has a unique reviewed destination: {uuid}")
        source_core, source_variant = name_parts(source["climb_name"])
        candidate_core, candidate_variant = name_parts(candidate.name)
        grade, _, _ = parse_grade(candidate.type, source["grade_vscale"], source["grade_yds"])
        if (source_types(source) != (candidate.type,) or source_variant != candidate_variant
                or source_core.replace(" ", "") != candidate_core.replace(" ", "")
                or grade is None or candidate.grade is None or abs(grade - candidate.grade) > 1):
            raise ValueError(f"Audited promotion no longer satisfies identity checks: {uuid}")
        matched.append(item | {
            "betabook_id": candidate.id, "betabook_name": candidate.name,
            "betabook_current_area_id": candidate.area_id,
            "betabook_current_path": " > ".join(matcher.path_names(candidate.area_id)),
            "match_kind": "audited_path_support", "move_to_area": "",
        })
        promoted_uuids.add(uuid)
        used_climb_ids.add(climb_id)
    review = [item for item in review if item["openbeta_id"] not in promoted_uuids]
    late_targets = parallel_route_targets(matcher, matched)
    late_resolutions, late_reparents, late_unresolved = reconcile_parallel_areas(
        matcher, late_targets, matched, new, review, unsupported)
    if any(item["openbeta_path"] in parallel_counts for item in late_resolutions):
        raise ValueError("A held parallel path resolved after promotions; review recovery is required")
    area_resolutions.extend(late_resolutions)
    area_reparents.extend(late_reparents)
    for item in late_resolutions:
        parallel_targets.pop(item["openbeta_path"], None)
    parallel_targets.update(late_unresolved)
    reviewed_targets = {}
    for row in alignment_rows:
        path, target = row["openbeta_path"], int(row["existing_area_id"])
        corroborated = {item["betabook_id"] for item in matched
                        if item["openbeta_path"] == path
                        and target in matcher.path(item["betabook_current_area_id"])}
        if len(corroborated) < int(row["min_matched_routes"]):
            raise ValueError(f"Reviewed area alignment lost route support: {path}")
        reviewed_targets[path] = target
    reviewed_resolutions, reviewed_reparents, reviewed_unresolved = reconcile_parallel_areas(
        matcher, reviewed_targets, matched, new, review, unsupported)
    if reviewed_unresolved or len(reviewed_resolutions) != len(reviewed_targets):
        raise ValueError(f"Reviewed area alignment could not be applied: {reviewed_unresolved}")
    for item in reviewed_resolutions:
        item["action"] = ("reviewed_area_reparent" if item["action"] == "reparent_existing_area"
                          else "reviewed_area_existing")
    area_resolutions.extend(reviewed_resolutions)
    area_reparents.extend(reviewed_reparents)
    skipped_resolutions, skipped_reparents = reconcile_skipped_source_parents(
        matcher, matched, new, review, unsupported, placement_exceptions)
    area_resolutions.extend(skipped_resolutions)
    area_reparents.extend(skipped_reparents)
    anchor_corrections = correct_wrong_area_anchors(matcher, matched, new, review, unsupported)
    reviewed_branch_corrections = force_reviewed_source_branches(
        matcher, source_branch_rows, matched, new, review, unsupported)
    applied_parent_moves = apply_reviewed_parent_moves(matcher, parent_move_rows, area_reparents)
    area_resolutions.extend(applied_parent_moves)
    review_by_uuid = {item["openbeta_id"]: item for item in review}
    reviewed_new_ids = set()
    for approved in new_release_rows:
        uuid = approved["openbeta_id"]
        item, source = review_by_uuid.get(uuid), source_by_uuid.get(uuid)
        if (not item or item["reason"] != approved["expected_review_reason"] or not source
                or len(source_types(source)) != 1
                or item["area_quality"] != "semantic_source_branch"):
            raise ValueError(f"Reviewed new route release changed: {uuid}")
        climb_type = source_types(source)[0]
        grade, raw_grade, grade_quality = parse_grade(
            climb_type, source["grade_vscale"], source["grade_yds"])
        if grade is None:
            raise ValueError(f"Reviewed new route has no representable grade: {uuid}")
        new.append(item | {"betabook_id": 0, "type": climb_type, "grade": grade,
                           "grade_quality": grade_quality,
                           "description": (source["description"] or "").strip() or None})
        if grade_quality not in {"exact", "missing"}:
            grade_rows.append({"openbeta_id": uuid, "name": source["climb_name"],
                               "original_grade": raw_grade, "betabook_grade": grade,
                               "quality": grade_quality})
        reviewed_new_ids.add(uuid)
    review = [item for item in review if item["openbeta_id"] not in reviewed_new_ids]
    review_by_uuid = {item["openbeta_id"]: item for item in review}
    released_uuids = set()
    distinct_release_skipped_grade = 0
    distinct_release_already_accepted = 0
    distinct_release_skipped_parallel = 0
    release_checks = (
        "non_generic_name", "named_source_and_namesake_crags", "all_namesake_crags_distinct",
        "no_cross_level_area_alias", "all_namesake_gps_present", "all_namesakes_over_20km",
        "no_exact_named_bb_candidate", "non_generic_feature_name", "non_placeholder_or_descriptive_name",
    )
    for approved in distinct_rows:
        uuid = approved["openbeta_id"]
        if any(item["openbeta_id"] == uuid for item in new):
            distinct_release_already_accepted += 1
            continue
        item = review_by_uuid.get(uuid)
        source = source_by_uuid.get(uuid)
        types = source_types(source) if source else ()
        if len(types) == 1 and parse_grade(types[0], source["grade_vscale"], source["grade_yds"])[0] is None:
            distinct_release_skipped_grade += 1
            continue
        if item and item["openbeta_path"] in parallel_counts:
            distinct_release_skipped_parallel += 1
            continue
        if (not item or item["reason"] != "same_name_in_openbeta_region" or not source
                or item["area_quality"] in {"ambiguous_anchor", "state_only"}
                or any(approved[key] != "True" for key in release_checks)
                or float(approved["nearest_namesake_distance_km"]) <= 20):
            raise ValueError(f"Distinct-crag release no longer passes the reviewed gates: {uuid}")
        if len(types) != 1:
            raise ValueError(f"Distinct-crag release has ambiguous type: {uuid}")
        grade, raw_grade, grade_quality = parse_grade(types[0], source["grade_vscale"], source["grade_yds"])
        if grade is None:
            distinct_release_skipped_grade += 1
            continue
        new.append(item | {"betabook_id": 0, "type": types[0], "grade": grade,
                           "grade_quality": grade_quality,
                           "description": (source["description"] or "").strip() or None})
        if grade_quality not in {"exact", "missing"}:
            grade_rows.append({"openbeta_id": uuid, "name": source["climb_name"],
                               "original_grade": raw_grade, "betabook_grade": grade,
                               "quality": grade_quality})
        released_uuids.add(uuid)
    review = [item for item in review if item["openbeta_id"] not in released_uuids]
    reviewed_area_hold_rows, reviewed_area_hold_uuids = hold_reviewed_area_paths(
        matcher, area_hold_input, new, review, payload_aliases_to_new)
    nearby_pairs, nearby_held = nearby_same_name_source_pairs(new, source_by_uuid)
    if nearby_held:
        held_new = {item["openbeta_id"]: item for item in new if item["openbeta_id"] in nearby_held}
        new = [item for item in new if item["openbeta_id"] not in nearby_held]
        for item in held_new.values():
            review.append(item | {"reason": "nearby_same_name_in_openbeta",
                                  "candidate_id": "", "candidate_name": "",
                                  "candidate_path": "", "score": ""})
        for alias_uuid, representative in list(payload_aliases_to_new.items()):
            if representative not in held_new:
                continue
            review.append(held_new[representative] | {
                "openbeta_id": alias_uuid, "reason": "nearby_same_name_in_openbeta",
                "candidate_id": "", "candidate_name": "",
                "candidate_path": "", "score": "",
            })
            del payload_aliases_to_new[alias_uuid]
        released_uuids.difference_update(nearby_held)
    for ident, item in enumerate(new, matcher.base_climb_max + 1):
        item["betabook_id"] = ident
    if any(item["grade"] is None for item in new):
        raise ValueError("Ungraded climb escaped the import filter")
    parallel_move_rows = []
    parallel_move_counts: Counter[str] = Counter()
    for item in matched:
        target = parallel_targets.get(item["openbeta_path"])
        if (target and item["move_to_area"]
                and matcher.areas[int(item["move_to_area"])].new
                and target not in matcher.path(int(item["move_to_area"]))):
            parallel_move_counts[item["openbeta_path"]] += 1
            parallel_move_rows.append({
                "openbeta_id": item["openbeta_id"], "openbeta_name": item["openbeta_name"],
                "betabook_id": item["betabook_id"],
                "current_area_path": item["betabook_current_path"],
                "proposed_new_area_path": item["betabook_area_path"],
                "existing_area_id": target,
                "existing_area_path": " > ".join(matcher.path_names(target)),
            })
            item["move_to_area"] = ""
    parallel_paths = set(parallel_counts) | set(parallel_move_counts)
    area_duplicate_merges = merge_duplicate_area_siblings(
        matcher, matched, new, review, unsupported, area_reparents, area_resolutions)
    reviewed_route_move_decisions = apply_reviewed_route_moves(
        matcher, route_move_rows, matched, source_by_uuid)
    area_conflict_rows, area_conflict_held_uuids = hold_route_evidence_area_conflicts(
        matcher, matched, new, review, payload_aliases_to_new)
    surviving_new = {item["openbeta_id"] for item in new}
    released_uuids.intersection_update(surviving_new)
    for ident, item in enumerate(new, matcher.base_climb_max + 1):
        item["betabook_id"] = ident
    moves = [(int(item["move_to_area"]), item["betabook_id"], item["betabook_current_area_id"])
             for item in matched if item["move_to_area"]]
    parent_conflict_decisions = mark_reviewed_source_parent_conflicts(
        matcher, parent_conflict_rows, (matched, new, review, unsupported))

    # Earlier decisions can gain a new ancestor after their source path was
    # scored. Report the final physical path for every proposed destination.
    for item in matched + new + review + unsupported:
        area_id = item.get("betabook_area_id")
        if area_id:
            item["betabook_area_path"] = " > ".join(matcher.path_names(area_id))
    for item in area_resolutions:
        item["resolved_area_path"] = " > ".join(matcher.path_names(item["existing_area_id"]))
    for item in matcher.area_review:
        item["betabook_path"] = " > ".join(matcher.path_names(item["area_id"]))

    # Do not insert empty areas that only belonged to reviewed/unsupported rows.
    used_new_areas = set()
    for area_id in ([item["betabook_area_id"] for item in new]
                    + [target for target, _, _ in moves]
                    + [new_parent for _, _, new_parent in area_reparents]):
        for ancestor in matcher.path(area_id):
            if matcher.areas[ancestor].new:
                used_new_areas.add(ancestor)

    status_by_uuid: dict[str, tuple[str, int | None, str | None, float | None]] = {}
    for status, items in (("matched", matched), ("new", new), ("review", review), ("unsupported", unsupported)):
        for item in items:
            uuid = item["openbeta_id"]
            if uuid in status_by_uuid:
                raise ValueError(f"OpenBeta UUID assigned twice: {uuid}")
            decision = (item.get("match_kind") if status == "matched" else "insert" if status == "new"
                        else item.get("reason"))
            raw_score = item.get("score")
            score = float(raw_score) if raw_score not in (None, "") else None
            status_by_uuid[uuid] = (status, int(item["betabook_id"]) if status in {"matched", "new"} else None,
                                    decision, score)
    new_ids_by_uuid = {item["openbeta_id"]: item["betabook_id"] for item in new}
    for alias_uuid, representative_uuid in payload_aliases_to_new.items():
        if alias_uuid in status_by_uuid:
            raise ValueError(f"Exact-payload alias assigned twice: {alias_uuid}")
        status_by_uuid[alias_uuid] = ("new", new_ids_by_uuid[representative_uuid], "exact_payload_new_alias", None)
    if len(status_by_uuid) != len(sources):
        raise ValueError("Not every OpenBeta route received an import status")
    source_rows = []
    for source in sources:
        latitude, longitude = source["latitude"], source["longitude"]
        if (latitude is None or longitude is None or not math.isfinite(latitude) or not math.isfinite(longitude)
                or not -90 <= latitude <= 90 or not -180 <= longitude <= 180):
            raise ValueError(f"Invalid OpenBeta GPS for {source['climb_id']}")
        status, climb_id, match_kind, match_score = status_by_uuid[source["climb_id"]]
        types = source_types(source)
        source_type = ",".join(types) if types else "top_rope" if source["is_top_rope"] else "unclassified"
        source_grade = source["grade_vscale"] if source["is_boulder"] else source["grade_yds"]
        source_rows.append(("openbeta", source["climb_id"], climb_id, source["climb_name"] or "",
                            source_grade, source_type, " > ".join(x for x in matcher.location(source) if x),
                            latitude, longitude, status, match_kind, match_score, release))
    area_source_rows = []
    for location in sorted({matcher.location(source) for source in sources}):
        location_text = " > ".join(x for x in location if x)
        if location_text in parallel_paths:
            area_source_rows.append(("openbeta", location_text, parallel_targets[location_text],
                                     "parallel_area_review", release))
            continue
        mapped = matcher.location_map.get(location)
        if mapped:
            area_id, quality = mapped
            if matcher.areas[area_id].new and area_id not in used_new_areas:
                area_id, quality = None, "unmaterialized_" + quality
        else:
            area_id, quality = None, "unsupported"
        area_source_rows.append(("openbeta", location_text, area_id, quality, release))
    area_source_paths = {row[1] for row in area_source_rows}
    for decision in alias_decisions:
        prefix = decision["openbeta_prefix"]
        if prefix not in area_source_paths:
            area_source_rows.append(("openbeta", prefix, decision["existing_area_id"],
                                     "reviewed_area_alias", release))
            area_source_paths.add(prefix)

    fields = ["openbeta_id", "openbeta_name", "openbeta_path", "betabook_area_id", "betabook_area_path", "area_quality", "openbeta_types", "openbeta_grade"]
    write_csv(output / "matches.csv", fields + ["betabook_id", "betabook_name", "betabook_current_area_id", "betabook_current_path", "score", "match_kind", "move_to_area"], matched)
    write_csv(output / "moves.csv", fields + ["betabook_id", "betabook_name", "betabook_current_area_id", "betabook_current_path", "score", "match_kind", "move_to_area"],
              [item for item in matched if item["move_to_area"]])
    write_csv(output / "new_climbs.csv", fields + ["betabook_id", "type", "grade", "grade_quality", "description"], new)
    write_csv(output / "review.csv", fields + ["reason", "candidate_id", "candidate_name", "candidate_path", "candidate_area_id", "score"], review)
    write_csv(output / "source_aliases.csv", ["openbeta_id", "representative_id", "betabook_id", "kind"],
              [{"openbeta_id": alias_uuid, "representative_id": representative_uuid,
                "betabook_id": new_ids_by_uuid[representative_uuid], "kind": "new_exact_payload"}
               for alias_uuid, representative_uuid in sorted(payload_aliases_to_new.items())]
              + [{"openbeta_id": item["openbeta_id"], "representative_id": "",
                  "betabook_id": item["betabook_id"], "kind": "existing_exact_payload"}
                 for item in payload_existing_links])
    write_csv(output / "nearby_source_name_review.csv",
              ["openbeta_id_a", "openbeta_name_a", "openbeta_path_a", "grade_a",
               "openbeta_id_b", "openbeta_name_b", "openbeta_path_b", "grade_b",
               "distance_km"], nearby_pairs)
    write_csv(output / "unsupported.csv", fields + ["reason"], unsupported)
    write_csv(output / "area_review.csv", ["location", "area_id", "reason", "betabook_path"], matcher.area_review)
    write_csv(output / "area_reconciliations.csv",
              ["openbeta_path", "existing_area_id", "original_area_path", "resolved_area_path",
               "action", "old_parent_id", "new_parent_id", "matched_routes", "new_routes_reassigned"],
              area_resolutions)
    write_csv(output / "reviewed_area_alignment_decisions.csv",
              ["openbeta_path", "existing_area_id", "original_area_path", "resolved_area_path",
               "action", "old_parent_id", "new_parent_id", "matched_routes", "new_routes_reassigned"],
              reviewed_resolutions)
    write_csv(output / "reviewed_parent_moves.csv",
              ["openbeta_path", "existing_area_id", "original_area_path", "resolved_area_path",
               "action", "old_parent_id", "new_parent_id", "matched_routes", "new_routes_reassigned"],
              applied_parent_moves)
    write_csv(output / "reviewed_pre_match_parent_moves.csv",
              ["openbeta_path", "existing_area_id", "original_area_path", "resolved_area_path",
               "action", "old_parent_id", "new_parent_id", "matched_routes", "new_routes_reassigned"],
              early_parent_decisions)
    write_csv(output / "reviewed_area_alias_decisions.csv",
              ["openbeta_prefix", "existing_area_id", "source_planning_area_id",
               "original_area_path", "corroborating_original_climbs",
               "folded_planning_areas", "source_paths_reassigned",
               "original_parent_preserved", "evidence", "source_url"],
              alias_decisions)
    write_csv(output / "reviewed_route_moves.csv",
              ["openbeta_id", "betabook_id", "original_area_id", "original_area_path",
               "target_area_id", "target_area_path", "evidence", "source_url"],
              reviewed_route_move_decisions)
    write_csv(output / "reviewed_source_parent_conflicts.csv",
              ["openbeta_prefix", "existing_area_id", "affected_source_paths",
               "reason", "evidence_url"], parent_conflict_decisions)
    write_csv(output / "area_reparents.csv",
              ["area_id", "area_name", "old_parent_id", "new_parent_id", "resolved_area_path"],
              [{"area_id": area_id, "area_name": matcher.areas[area_id].name,
                "old_parent_id": old_parent, "new_parent_id": new_parent,
                "resolved_area_path": " > ".join(matcher.path_names(area_id))}
               for area_id, old_parent, new_parent in area_reparents])
    write_csv(output / "area_duplicate_merges.csv",
              ["generated_area_id", "surviving_area_id", "generated_area_path",
               "surviving_area_path", "direct_new_routes_reassigned", "source_paths_remapped"],
              area_duplicate_merges)
    write_csv(output / "area_anchor_corrections.csv",
              ["openbeta_path", "wrong_area_id", "wrong_area_path", "corrected_area_id",
               "corrected_area_path", "matched_routes", "new_routes_reassigned"],
              anchor_corrections)
    write_csv(output / "reviewed_source_branch_corrections.csv",
              ["openbeta_path", "wrong_area_id", "wrong_area_path", "corrected_area_id",
               "corrected_area_path", "new_routes_reassigned", "evidence", "confidence"],
              reviewed_branch_corrections)
    write_csv(output / "area_placement_exceptions.csv",
              ["openbeta_path", "existing_area_id", "reason", "evidence_url"], placement_rows)
    write_csv(output / "rejected_matches.csv",
              ["openbeta_id", "betabook_id", "reason", "evidence_url"], rejection_rows)
    write_csv(output / "reviewed_new_releases.csv",
              ["openbeta_id", "expected_review_reason", "evidence", "source_url"], new_release_rows)
    write_csv(output / "reviewed_area_holds.csv",
              ["openbeta_path", "held_new_routes", "mapped_area_id", "mapped_area_path",
               "reason", "confidence", "evidence_url"], reviewed_area_hold_rows)
    write_csv(output / "route_evidence_area_conflicts.csv",
              ["openbeta_path", "mapped_area_id", "mapped_area_path",
               "unrelated_matched_routes", "related_matched_routes", "held_new_routes",
               "existing_area_ids", "existing_area_paths", "sample_matched_names"],
              area_conflict_rows)
    write_csv(output / "grade_review.csv", ["openbeta_id", "name", "original_grade", "betabook_grade", "quality"], grade_rows)
    write_csv(output / "areas.csv", ["id", "parent_id", "name", "betabook_path"], [
        {"id": area.id, "parent_id": area.parent_id, "name": area.name, "betabook_path": " > ".join(matcher.path_names(area.id))}
        for area in matcher.areas.values() if area.id in used_new_areas
    ])
    write_csv(output / "parallel_area_review.csv",
              ["openbeta_path", "candidate_area_id", "candidate_area_path", "matched_routes", "held_new_routes", "held_existing_moves"],
              [{"openbeta_path": path, "candidate_area_id": parallel_targets[path],
                "candidate_area_path": " > ".join(matcher.path_names(parallel_targets[path])),
                "matched_routes": sum(item["openbeta_path"] == path for item in matched),
                "held_new_routes": parallel_counts[path],
                "held_existing_moves": parallel_move_counts[path]}
               for path in sorted(parallel_paths)])
    write_csv(output / "parallel_move_review.csv",
              ["openbeta_id", "openbeta_name", "betabook_id", "current_area_path",
               "proposed_new_area_path", "existing_area_id", "existing_area_path"], parallel_move_rows)
    area_review_reasons = {"parallel_area_with_route_evidence", "ambiguous_area_anchor",
                           "state_only_location", "reviewed_area_hold",
                           "route_evidence_area_conflict"}
    area_worklist: dict[str, list[dict]] = defaultdict(list)
    for item in review:
        if item["reason"] in area_review_reasons:
            area_worklist[item["openbeta_path"]].append(item)
    for path in parallel_paths:
        area_worklist.setdefault(path, [])
    for path in placement_exceptions:
        area_worklist.setdefault(path, [])
    for path in (row["openbeta_path"] for row in area_hold_input):
        area_worklist.setdefault(path, [])
    for path in (row["openbeta_path"] for row in area_conflict_rows):
        area_worklist.setdefault(path, [])
    held_area_targets = {row["openbeta_path"]: row["mapped_area_id"]
                         for row in reviewed_area_hold_rows}
    held_area_targets.update({row["openbeta_path"]: row["mapped_area_id"]
                              for row in area_conflict_rows})
    area_worklist_rows = []
    for path, items in area_worklist.items():
        target = (parallel_targets.get(path) if path in parallel_paths
                  else placement_exceptions.get(path) or held_area_targets.get(path))
        area_worklist_rows.append({
            "openbeta_path": path, "held_routes": len(items),
            "held_moves": parallel_move_counts[path],
            "reasons": ("; ".join(f"{reason}:{count}" for reason, count in Counter(item["reason"] for item in items).most_common())
                        or ("source_parent_conflict:1" if path in placement_exceptions else "")),
            "candidate_existing_area_id": target or "",
            "candidate_existing_area_path": " > ".join(matcher.path_names(target)) if target else "",
            "sample_route_names": "; ".join(dict.fromkeys(item["openbeta_name"] for item in items[:5])),
            "sample_openbeta_ids": "; ".join(item["openbeta_id"] for item in items[:5]),
        })
    area_worklist_rows.sort(key=lambda item: (-item["held_routes"] - item["held_moves"], item["openbeta_path"]))
    write_csv(output / "area_review_worklist.csv",
              ["openbeta_path", "held_routes", "held_moves", "reasons", "candidate_existing_area_id",
               "candidate_existing_area_path", "sample_route_names", "sample_openbeta_ids"], area_worklist_rows)
    sql_dir = output / "sql"
    sql_dir.mkdir(parents=True, exist_ok=True)
    for old_chunk in sql_dir.glob("*.sql"):
        old_chunk.unlink()
    area_rows = [(a.id, a.parent_id, a.name, None) for a in matcher.areas.values() if a.id in used_new_areas]
    climb_rows = [(item["betabook_id"], item["betabook_area_id"], item["openbeta_name"], item["type"], item["grade"], item["description"])
                  for item in new]
    area_files = write_sql_chunks(sql_dir, "10-areas", "areas", ("id", "parent_id", "name", "description"), area_rows)
    reparent_files = []
    for offset in range(0, len(area_reparents), 4000):
        filename = f"12-area-reparents-{offset // 4000 + 1:03}.sql"
        reparent_files.append(filename)
        with (sql_dir / filename).open("w") as stream:
            for area_id, old_parent, new_parent in area_reparents[offset : offset + 4000]:
                stream.write(f"UPDATE areas SET parent_id={new_parent} WHERE id={area_id} AND parent_id={old_parent};\n")
    climb_files = write_sql_chunks(sql_dir, "30-climbs", "climbs", ("id", "area_id", "name", "type", "grade", "description"), climb_rows)
    area_source_files = write_sql_chunks(sql_dir, "15-area-sources", "catalog_area_sources",
                                         ("source", "source_path", "area_id", "quality", "release"), area_source_rows)
    source_files = write_sql_chunks(sql_dir, "40-route-sources", "catalog_route_sources",
                                    ("source", "source_id", "climb_id", "source_name", "source_grade", "source_type",
                                     "source_path", "latitude", "longitude", "status", "match_kind", "match_score", "release"), source_rows)
    move_files = []
    if moves:
        for offset in range(0, len(moves), 4000):
            filename = f"20-moves-{offset // 4000 + 1:03}.sql"
            move_files.append(filename)
            with (sql_dir / filename).open("w") as stream:
                for target, ident, original in moves[offset : offset + 4000]:
                    stream.write(f"UPDATE climbs SET area_id={target} WHERE id={ident} AND area_id={original};\n")
    if {int(row["climb_id"]) for row in final_climb_move_rows} & {ident for _, ident, _ in moves}:
        raise ValueError("A reviewed final climb move duplicates a source-driven climb move")
    reviewed_final_climb_sql = plan_reviewed_final_climb_moves(matcher, final_climb_move_rows)
    final_climb_files = []
    if final_climb_move_rows:
        filename = "45-reviewed-final-climb-moves.sql"
        (sql_dir / filename).write_text(reviewed_final_climb_sql)
        final_climb_files.append(filename)
    write_csv(output / "reviewed_final_climb_moves.csv",
              ["climb_id", "climb_name", "climb_type", "grade_ordinal",
               "expected_area_id", "target_area_id", "evidence", "source_url"],
              final_climb_move_rows)
    reviewed_original_merges, applied_final_parent_moves, original_merge_sql = plan_reviewed_original_area_merges(
        matcher, original_area_merge_rows, final_parent_move_rows)
    original_merge_files = []
    if reviewed_original_merges or applied_final_parent_moves:
        filename = "50-reviewed-area-consolidation.sql"
        (sql_dir / filename).write_text(original_merge_sql)
        original_merge_files.append(filename)
    write_csv(output / "reviewed_original_area_merges.csv",
              ["duplicate_area_id", "survivor_area_id", "duplicate_name", "survivor_name",
               "survivor_display_name", "survivor_new_parent_area_id", "evidence", "source_url",
               "old_parent_id", "direct_original_climbs_moved",
              "child_areas_moved", "duplicate_path", "survivor_path"],
              reviewed_original_merges)
    write_csv(output / "reviewed_final_parent_moves.csv",
              ["area_id", "area_name", "expected_old_parent_id", "new_parent_id",
               "new_parent_name", "evidence", "source_url"],
              applied_final_parent_moves)
    area_source_by_path = {row[1]: (row[2], row[3]) for row in area_source_rows}
    area_merge_redirects = {int(row["duplicate_area_id"]): int(row["survivor_area_id"])
                            for row in reviewed_original_merges}

    def consolidated_area(area_id: int | None) -> int | None:
        seen = set()
        while area_id in area_merge_redirects:
            if area_id in seen:
                raise ValueError(f"Cycle in reviewed source-area redirects: {area_id}")
            seen.add(area_id)
            area_id = area_merge_redirects[area_id]
        return area_id

    source_area_sql = ["CREATE TABLE openbeta_source_area_guard (ok INTEGER NOT NULL CHECK(ok=1));"]

    def sql_quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    for row in final_source_area_rows:
        source_path = row["source_path"]
        expected_area_text = row["expected_area_id"].strip()
        expected_area = (None if expected_area_text.upper() in {"", "NULL"}
                         else int(expected_area_text))
        target_area = int(row["target_area_id"])
        expected_quality = row["expected_quality"]
        planned_area = area_source_by_path.get(source_path)
        if (not planned_area or
                (consolidated_area(planned_area[0]), planned_area[1]) != (expected_area, expected_quality)
                or target_area not in matcher.areas or not row["source_url"]):
            raise ValueError(f"Reviewed final source-area identity changed: {source_path}")
        expected_area_guard = ("area_id IS NULL" if expected_area is None
                               else f"area_id={expected_area}")
        source_area_sql.extend([
            "INSERT INTO openbeta_source_area_guard (ok) SELECT CASE WHEN EXISTS("
            "SELECT 1 FROM catalog_area_sources WHERE source='openbeta' "
            f"AND source_path={sql_quote(source_path)} AND {expected_area_guard} "
            f"AND quality={sql_quote(expected_quality)}) THEN 1 ELSE 0 END;",
            "DELETE FROM openbeta_source_area_guard;",
            "UPDATE catalog_area_sources SET "
            f"area_id={target_area},quality='reviewed_area_identity' WHERE source='openbeta' "
            f"AND source_path={sql_quote(source_path)} AND {expected_area_guard} "
            f"AND quality={sql_quote(expected_quality)};",
        ])
    source_area_sql.append("DROP TABLE openbeta_source_area_guard;")
    source_area_files = []
    if final_source_area_rows:
        filename = "60-reviewed-source-area-alignments.sql"
        (sql_dir / filename).write_text("\n".join(source_area_sql) + "\n")
        source_area_files.append(filename)
    write_csv(output / "reviewed_final_source_area_alignments.csv",
              ["source_path", "expected_area_id", "expected_quality", "target_area_id",
               "evidence", "source_url"], final_source_area_rows)
    final_route_link_sql, relinked_source_uuids = plan_reviewed_final_route_links(
        matcher, final_route_link_rows, new, source_rows)
    new_descendant_originals = {int(row["original_climb_id"])
                                for row in final_route_link_rows
                                if row["relationship"] in {"new_descendant", "reviewed_cross_branch"}}
    if new_descendant_originals & ({ident for _, ident, _ in moves}
                                   | {int(row["climb_id"]) for row in final_climb_move_rows}):
        raise ValueError("A reviewed route link would move an already relocated original climb")
    final_route_link_files = []
    if final_route_link_rows:
        filename = "70-reviewed-final-route-links.sql"
        (sql_dir / filename).write_text(final_route_link_sql)
        final_route_link_files.append(filename)
    final_semantic_files = []
    if semantic_sql_file:
        filename = "80-reviewed-final-semantic.sql"
        (sql_dir / filename).write_bytes(semantic_sql_file.read_bytes())
        final_semantic_files.append(filename)
    write_csv(output / "reviewed_final_route_links.csv",
              ["openbeta_id", "original_climb_id", "new_climb_id", "original_name",
               "new_name", "type", "original_grade_ordinal", "new_grade_ordinal",
               "expected_original_area_id", "expected_new_area_id", "relationship",
               "original_area_path", "new_area_path", "source_path", "source_url",
               "evidence"],
              final_route_link_rows)
    (sql_dir / "00-guard.sql").write_text(
        "-- Run once before all import chunks. Abort on a different production catalog.\n"
        "CREATE TABLE openbeta_catalog_guard (ok INTEGER NOT NULL CHECK(ok=1));\n"
        "INSERT INTO openbeta_catalog_guard (ok) SELECT CASE WHEN "
        f"(SELECT COUNT(*) FROM areas)={matcher.base_area_count} AND "
        f"(SELECT MAX(id) FROM areas)={matcher.base_area_max} AND "
        f"(SELECT COUNT(*) FROM climbs)={matcher.base_climb_count} AND "
        f"(SELECT MAX(id) FROM climbs)={matcher.base_climb_max} AND "
        "(SELECT COUNT(*) FROM catalog_route_sources)=0 AND "
        "(SELECT COUNT(*) FROM catalog_area_sources)=0 THEN 1 ELSE 0 END;\n"
        "DROP TABLE openbeta_catalog_guard;\n"
    )
    manifest = {
        "release": release,
        "parquet": str(parquet), "parquet_sha256": hashlib.sha256(parquet.read_bytes()).hexdigest(),
        "catalog_sql": str(catalog_sql), "catalog_sha256": hashlib.sha256(catalog_sql.read_bytes()).hexdigest(),
        "source_routes": len(sources), "existing_areas": matcher.base_area_count,
        "existing_area_max_id": matcher.base_area_max,
        "decoded_source_text_fields": decoded_text_fields,
        "existing_climbs": matcher.base_climb_count,
        "existing_climb_max_id": matcher.base_climb_max, "matched": len(matched),
        "new_areas": len(area_rows), "new_climbs": len(new),
        "source_new_links": len(new) + len(payload_aliases_to_new), "review": len(review),
        "existing_exact_payload_links": len(payload_existing_links),
        "new_exact_payload_aliases": len(payload_aliases_to_new),
        "unsupported": len(unsupported), "proposed_moves": len(moves),
        "nearby_source_name_pairs_held": len(nearby_pairs),
        "nearby_source_name_uuids_held": len(nearby_held),
        "unnamed_routes_ignored": sum(item["reason"] == "unnamed_route_ignored" for item in unsupported),
        "ungraded_routes_ignored": sum(item["reason"] == "ungraded_route_ignored" for item in unsupported),
        "unrepresentable_grades_ignored": sum(item["reason"] == "unrepresentable_grade_ignored" for item in unsupported),
        "area_reconciliations": len(area_resolutions),
        "late_route_evidence_area_reconciliations": len(late_resolutions),
        "reviewed_area_alignments_applied": len(reviewed_resolutions),
        "reviewed_area_alignments": str(reviewed_area_alignments) if reviewed_area_alignments else None,
        "reviewed_area_alignments_sha256": hashlib.sha256(reviewed_area_alignments.read_bytes()).hexdigest() if reviewed_area_alignments else None,
        "areas_reparented": len(area_reparents),
        "reviewed_original_area_merges": str(reviewed_original_area_merges) if reviewed_original_area_merges else None,
        "reviewed_original_area_merges_sha256": hashlib.sha256(reviewed_original_area_merges.read_bytes()).hexdigest() if reviewed_original_area_merges else None,
        "reviewed_original_area_merges_applied": len(reviewed_original_merges),
        "reviewed_final_parent_moves": str(reviewed_final_parent_moves) if reviewed_final_parent_moves else None,
        "reviewed_final_parent_moves_sha256": hashlib.sha256(reviewed_final_parent_moves.read_bytes()).hexdigest() if reviewed_final_parent_moves else None,
        "reviewed_final_parent_moves_applied": len(applied_final_parent_moves),
        "reviewed_final_climb_moves": str(reviewed_final_climb_moves) if reviewed_final_climb_moves else None,
        "reviewed_final_climb_moves_sha256": hashlib.sha256(reviewed_final_climb_moves.read_bytes()).hexdigest() if reviewed_final_climb_moves else None,
        "reviewed_final_climb_moves_applied": len(final_climb_move_rows),
        "reviewed_final_source_area_alignments": str(reviewed_final_source_area_alignments) if reviewed_final_source_area_alignments else None,
        "reviewed_final_source_area_alignments_sha256": hashlib.sha256(reviewed_final_source_area_alignments.read_bytes()).hexdigest() if reviewed_final_source_area_alignments else None,
        "reviewed_final_source_area_alignments_applied": len(final_source_area_rows),
        "reviewed_final_route_links": str(reviewed_final_route_links) if reviewed_final_route_links else None,
        "reviewed_final_route_links_sha256": hashlib.sha256(reviewed_final_route_links.read_bytes()).hexdigest() if reviewed_final_route_links else None,
        "reviewed_final_route_links_applied": len(final_route_link_rows),
        "reviewed_final_route_source_uuids": relinked_source_uuids,
        "reviewed_final_route_climb_moves": len(new_descendant_originals),
        "reviewed_final_semantic": str(reviewed_final_semantic) if reviewed_final_semantic else None,
        "reviewed_final_semantic_sha256": hashlib.sha256(reviewed_final_semantic.read_bytes()).hexdigest() if reviewed_final_semantic else None,
        "reviewed_final_semantic_sql": str(semantic_sql_file) if semantic_sql_file else None,
        "reviewed_final_semantic_sql_sha256": hashlib.sha256(semantic_sql_file.read_bytes()).hexdigest() if semantic_sql_file else None,
        "reviewed_final_semantic_new_areas": len(semantic_checks["new_areas"]) if semantic_checks else 0,
        "reviewed_final_semantic_area_renames": len(semantic_checks.get("area_renames", [])) if semantic_checks else 0,
        "reviewed_final_semantic_source_area_alignments": len(semantic_checks.get("source_area_alignments", [])) if semantic_checks else 0,
        "reviewed_final_semantic_deleted_areas": len(semantic_checks.get("deleted_areas", [])) if semantic_checks else 0,
        "reviewed_final_semantic_held_source_links": len(semantic_checks["held_source_links"]) if semantic_checks else 0,
        "reviewed_final_semantic_original_climb_moves": sum(
            int(row["id"]) <= matcher.base_climb_max for row in semantic_checks["climb_moves"]
        ) if semantic_checks else 0,
        "final_new_climbs": len(new) - len(final_route_link_rows),
        "final_new_source_links": len(new) + len(payload_aliases_to_new) - relinked_source_uuids,
        "final_matched_source_links": (len(matched) + relinked_source_uuids
                                       + (len(semantic_checks["held_source_links"])
                                          if semantic_checks else 0)),
        "duplicate_area_merges": len(area_duplicate_merges),
        "area_anchor_corrections": len(anchor_corrections),
        "reviewed_source_branch_corrections": len(reviewed_branch_corrections),
        "reviewed_source_branches": str(reviewed_source_branches) if reviewed_source_branches else None,
        "reviewed_source_branches_sha256": hashlib.sha256(reviewed_source_branches.read_bytes()).hexdigest() if reviewed_source_branches else None,
        "reviewed_parent_moves": str(reviewed_parent_moves) if reviewed_parent_moves else None,
        "reviewed_parent_moves_sha256": hashlib.sha256(reviewed_parent_moves.read_bytes()).hexdigest() if reviewed_parent_moves else None,
        "reviewed_parent_moves_applied": len(applied_parent_moves),
        "reviewed_area_aliases": str(reviewed_area_aliases) if reviewed_area_aliases else None,
        "reviewed_area_aliases_sha256": hashlib.sha256(reviewed_area_aliases.read_bytes()).hexdigest() if reviewed_area_aliases else None,
        "reviewed_area_aliases_applied": len(alias_decisions),
        "reviewed_pre_match_parent_moves": str(reviewed_pre_match_parent_moves) if reviewed_pre_match_parent_moves else None,
        "reviewed_pre_match_parent_moves_sha256": hashlib.sha256(reviewed_pre_match_parent_moves.read_bytes()).hexdigest() if reviewed_pre_match_parent_moves else None,
        "reviewed_pre_match_parent_moves_applied": len(early_parent_decisions),
        "reviewed_route_moves": str(reviewed_route_moves) if reviewed_route_moves else None,
        "reviewed_route_moves_sha256": hashlib.sha256(reviewed_route_moves.read_bytes()).hexdigest() if reviewed_route_moves else None,
        "reviewed_route_moves_applied": len(reviewed_route_move_decisions),
        "reviewed_source_parent_conflicts": str(reviewed_source_parent_conflicts) if reviewed_source_parent_conflicts else None,
        "reviewed_source_parent_conflicts_sha256": hashlib.sha256(reviewed_source_parent_conflicts.read_bytes()).hexdigest() if reviewed_source_parent_conflicts else None,
        "reviewed_source_parent_conflicts_applied": len(parent_conflict_decisions),
        "rejected_matches": str(rejected_matches) if rejected_matches else None,
        "rejected_matches_sha256": hashlib.sha256(rejected_matches.read_bytes()).hexdigest() if rejected_matches else None,
        "reviewed_false_matches_held": len(rejected_uuids),
        "reviewed_new_releases": str(reviewed_new_releases) if reviewed_new_releases else None,
        "reviewed_new_releases_sha256": hashlib.sha256(reviewed_new_releases.read_bytes()).hexdigest() if reviewed_new_releases else None,
        "reviewed_new_routes_released": len(reviewed_new_ids),
        "reviewed_area_holds": str(reviewed_area_holds) if reviewed_area_holds else None,
        "reviewed_area_holds_sha256": hashlib.sha256(reviewed_area_holds.read_bytes()).hexdigest() if reviewed_area_holds else None,
        "reviewed_area_hold_paths": len(reviewed_area_hold_rows),
        "reviewed_area_hold_uuids": reviewed_area_hold_uuids,
        "route_evidence_area_conflict_paths": len(area_conflict_rows),
        "route_evidence_area_conflict_uuids_held": area_conflict_held_uuids,
        "skipped_source_parents_restored": sum(item["action"] in {"restore_skipped_source_parents",
                                                             "restore_intermediate_source_parents"}
                                               for item in skipped_resolutions),
        "area_placement_exceptions": str(area_placement_exceptions) if area_placement_exceptions else None,
        "area_placement_exceptions_sha256": hashlib.sha256(area_placement_exceptions.read_bytes()).hexdigest() if area_placement_exceptions else None,
        "area_placement_exception_count": len(placement_rows),
        "area_paths_kept_existing": sum(item["action"].startswith("keep_") for item in area_resolutions),
        "parallel_area_paths_for_review": len(parallel_paths),
        "parallel_area_routes_held": sum(parallel_counts.values()),
        "parallel_area_moves_held": len(parallel_move_rows),
        "area_review_paths": len(area_worklist_rows),
        "audit_curation_held": curation_held,
        "audit_candidates": str(audit_candidates) if audit_candidates else None,
        "audit_candidates_sha256": hashlib.sha256(audit_candidates.read_bytes()).hexdigest() if audit_candidates else None,
        "audited_promotions": str(audited_promotions) if audited_promotions else None,
        "audited_promotions_sha256": hashlib.sha256(audited_promotions.read_bytes()).hexdigest() if audited_promotions else None,
        "audited_routes_promoted": len(promoted_uuids),
        "audited_promotions_already_accepted": promotions_already_accepted,
        "distinct_crags": str(distinct_crags) if distinct_crags else None,
        "distinct_crags_sha256": hashlib.sha256(distinct_crags.read_bytes()).hexdigest() if distinct_crags else None,
        "distinct_crag_routes_released": len(released_uuids),
        "distinct_crag_routes_skipped_parallel": distinct_release_skipped_parallel,
        "distinct_crag_routes_skipped_grade": distinct_release_skipped_grade,
        "distinct_crag_routes_already_accepted": distinct_release_already_accepted,
        "subarea_corroborations": str(subarea_corroborations) if subarea_corroborations else None,
        "subarea_corroborations_sha256": hashlib.sha256(subarea_corroborations.read_bytes()).hexdigest() if subarea_corroborations else None,
        "subarea_routes_promoted": len(subarea_promoted_ids),
        "gps_rows": len(source_rows),
        "gps_linked": (len(matched) + len(new) + len(payload_aliases_to_new)
                       + (len(semantic_checks["held_source_links"]) if semantic_checks else 0)),
        "unique_gps_points": len({(row[7], row[8]) for row in source_rows}),
        "area_crosswalks": len(area_source_rows),
        "sql_order": ["00-guard.sql"] + area_files + reparent_files + area_source_files + move_files + climb_files + source_files + final_climb_files + original_merge_files + source_area_files + final_route_link_files + final_semantic_files,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (output / "apply-order.txt").write_text("\n".join(manifest["sql_order"]) + "\n")
    (output / "README.md").write_text(
        f"# OpenBeta {release} catalog import\n\n"
        f"Source: https://github.com/OpenBeta/parquet-exporter/releases/download/{release}/openbeta-climbs.parquet\n\n"
        f"Parquet SHA-256: `{manifest['parquet_sha256']}`  \n"
        f"Betabook dump SHA-256: `{manifest['catalog_sha256']}`\n\n"
        f"After reviewed area and route consolidation, "
        f"{manifest['final_matched_source_links']:,} OpenBeta UUIDs link to existing "
        f"Betabook climbs and {manifest['final_new_source_links']:,} link to "
        f"{manifest['final_new_climbs']:,} physically new climbs. "
        f"The SQL initially inserts {len(new):,} climbs and {len(area_rows):,} areas, "
        f"then creates {manifest['reviewed_final_semantic_new_areas']:,} reviewed "
        f"geographic areas, "
        f"then removes {len(final_route_link_rows):,} freshly inserted climb duplicates "
        f"and {len(reviewed_original_merges):,} reviewed duplicate areas, then "
        f"removes {manifest['reviewed_final_semantic_deleted_areas']:,} empty "
        f"legacy areas after guarded route moves. "
        f"{len(review) - manifest['reviewed_final_semantic_held_source_links']:,} routes need review; "
        f"{len(unsupported):,} are unsupported or ignored, including "
        f"{manifest['unnamed_routes_ignored']:,} unnamed routes, "
        f"{manifest['ungraded_routes_ignored']:,} ungraded routes, and "
        f"{manifest['unrepresentable_grades_ignored']:,} routes whose source "
        f"grade cannot be stored in Betabook. No new climb has a null grade.\n\n"
        f"Route evidence reconciles {len(area_resolutions):,} source area paths: "
        f"{len(area_reparents):,} existing areas gain more specific parents, "
        f"including {manifest['skipped_source_parents_restored']:,} paths whose source parents had "
        f"previously been skipped; {len(area_duplicate_merges):,} generated duplicate areas "
        f"were folded into original IDs and {len(anchor_corrections) + len(reviewed_branch_corrections):,} wrong area "
        f"anchors were corrected; {manifest['area_paths_kept_existing']:,} paths "
        f"retain their existing placement. "
        f"The audit curation holds {curation_held:,} otherwise-new routes, and "
        f"{reviewed_area_hold_uuids:,} UUIDs at {len(reviewed_area_hold_rows):,} "
        f"agent-reviewed ambiguous area paths; {area_conflict_held_uuids:,} "
        f"more at {len(area_conflict_rows):,} paths with accepted-route area conflicts; "
        f"{len(nearby_held):,} nearby same-name UUIDs are held in "
        f"{len(nearby_pairs):,} cross-path pairs; "
        f"{sum(parallel_counts.values()):,} more and {len(parallel_move_rows):,} proposed area moves "
        f"are held at {len(parallel_paths):,} parallel area paths. "
        f"The area worklist has {len(area_worklist_rows):,} distinct paths. "
        f"{len(alias_decisions):,} reviewed source-area aliases were folded into "
        f"original Betabook IDs and {len(reviewed_route_move_decisions):,} accepted "
        f"original routes moved to independently verified source crags.\n\n"
        f"The final area pass makes {len(applied_final_parent_moves):,} further "
        f"reviewed parent moves, {len(final_climb_move_rows):,} guarded original "
        f"climb placements, and {len(final_source_area_rows):,} source-area "
        f"crosswalk corrections. {len(final_route_link_rows):,} newly imported "
        f"route IDs were re-linked to original climb IDs after semantic area "
        f"consolidation; {manifest['reviewed_final_semantic_held_source_links']:,} "
        f"held source UUIDs were separately linked after guarded geographic "
        f"route moves, and {manifest['reviewed_final_semantic_area_renames']:,} "
        f"activity-qualified area labels were renamed to their geographic "
        f"features. Source GPS and original grades remain intact.\n\n"
        f"{len(promoted_uuids):,} independently corroborated routes link to existing climbs "
        f"without area moves; {len(released_uuids):,} same-name routes at verified distant crags "
        f"are new. {len(subarea_promoted_ids):,} corroborated routes place an existing "
        f"Betabook subarea beneath its source location. Exact-payload aliases link {len(payload_existing_links):,} source UUIDs "
        f"to existing climbs and {len(payload_aliases_to_new):,} more UUIDs to one new climb "
        f"per source payload.\n\n"
        "Migration `drizzle/migrations/0046_catalog_sources.sql` must already be applied. Run the "
        "SQL files in `apply-order.txt` order. `00-guard.sql` checks that the "
        "production catalog still matches the inspected dump and that the source "
        "tables are empty; stop if it fails. Each chunk has explicit IDs.\n\n"
        "Review `area_reconciliations.csv`, `rejected_matches.csv`, "
        "`reviewed_new_releases.csv`, "
        "`reviewed_parent_moves.csv`, "
        "`reviewed_pre_match_parent_moves.csv`, `reviewed_area_alias_decisions.csv`, "
        "`reviewed_route_moves.csv`, `reviewed_source_parent_conflicts.csv`, "
        "`reviewed_area_alignment_decisions.csv`, "
        "`area_duplicate_merges.csv`, "
        "`reviewed_original_area_merges.csv`, `reviewed_final_parent_moves.csv`, "
        "`reviewed_final_climb_moves.csv`, `reviewed_final_route_links.csv`, "
        "`reviewed_final_source_area_alignments.csv`, "
        "`area_anchor_corrections.csv`, `reviewed_source_branch_corrections.csv`, "
        "`area_placement_exceptions.csv`, "
        "and `moves.csv` before applying area "
        "and climb moves. `review.csv` includes "
        "same-name routes held because their identity or area is uncertain. "
        "`reviewed_area_holds.csv` lists explicitly held ambiguous areas. "
        "`route_evidence_area_conflicts.csv` lists unresolved accepted-route "
        "placement contradictions and their held new routes. "
        "`nearby_source_name_review.csv` lists same-name source climbs within "
        "20 km on different paths. `unsupported.csv` lists routes whose type/name/location cannot be "
        "represented automatically. `grade_review.csv` records approximate or "
        "unmapped grades. `parallel_area_review.csv` and `parallel_move_review.csv` "
        "show the held hierarchy decisions; `area_review_worklist.csv` groups "
        "them by path. `audit-source-prefix-ancestry.csv` and "
        "`audit-missing-source-parents.csv` expose unresolved geographic "
        "prefixes. Read `audit-nonoverlaps.md` for the "
        "spot-check evidence.\n\n"
        "The `catalog_route_sources` table stores every OpenBeta UUID, decision, "
        "and GPS point; held routes have a null Betabook climb ID. "
        "`catalog_area_sources` stores the source-path alignment, including "
        "unresolved paths. Both tables can hold other providers' IDs later. "
        "Coordinates may identify a crag rather than the exact climb.\n"
    )
    print(json.dumps({key: value for key, value in manifest.items() if key != "sql_order"}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-sql", type=Path, required=True)
    parser.add_argument("--parquet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--audit-candidates", type=Path)
    parser.add_argument("--audited-promotions", type=Path)
    parser.add_argument("--distinct-crags", type=Path)
    parser.add_argument("--subarea-corroborations", type=Path)
    parser.add_argument("--area-placement-exceptions", type=Path)
    parser.add_argument("--reviewed-source-branches", type=Path)
    parser.add_argument("--reviewed-area-alignments", type=Path)
    parser.add_argument("--reviewed-parent-moves", type=Path)
    parser.add_argument("--rejected-matches", type=Path)
    parser.add_argument("--reviewed-area-holds", type=Path)
    parser.add_argument("--reviewed-new-releases", type=Path)
    parser.add_argument("--reviewed-area-aliases", type=Path)
    parser.add_argument("--reviewed-pre-match-parent-moves", type=Path)
    parser.add_argument("--reviewed-route-moves", type=Path)
    parser.add_argument("--reviewed-source-parent-conflicts", type=Path)
    parser.add_argument("--reviewed-original-area-merges", type=Path)
    parser.add_argument("--reviewed-final-parent-moves", type=Path)
    parser.add_argument("--reviewed-final-climb-moves", type=Path)
    parser.add_argument("--reviewed-final-source-area-alignments", type=Path)
    parser.add_argument("--reviewed-final-route-links", type=Path)
    parser.add_argument("--reviewed-final-semantic", type=Path)
    args = parser.parse_args()
    run(args.catalog_sql, args.parquet, args.output, args.release,
        args.audit_candidates, args.audited_promotions, args.distinct_crags,
        args.subarea_corroborations, args.area_placement_exceptions,
        args.reviewed_source_branches, args.reviewed_area_alignments,
        args.reviewed_parent_moves, args.rejected_matches,
        args.reviewed_area_holds, args.reviewed_new_releases,
        args.reviewed_area_aliases, args.reviewed_pre_match_parent_moves,
        args.reviewed_route_moves, args.reviewed_source_parent_conflicts,
        args.reviewed_original_area_merges, args.reviewed_final_parent_moves,
        args.reviewed_final_climb_moves, args.reviewed_final_source_area_alignments,
        args.reviewed_final_route_links, args.reviewed_final_semantic)
