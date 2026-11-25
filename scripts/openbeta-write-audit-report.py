#!/usr/bin/env python3
"""Write a compact review report from the generated import and audit artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def report(import_dir: Path) -> Path:
    manifest = json.loads((import_dir / "manifest.json").read_text())
    validation = json.loads((import_dir / "validation.json").read_text())
    routes = json.loads((import_dir / "audit-post-import.json").read_text())
    areas = json.loads((import_dir / "audit-area-dedupe-summary.json").read_text())
    if (routes["unreviewed_new_original_exact_candidate_pairs"]
            or areas["unreviewed_high_priority"]
            or areas["unreviewed_semantic_priority"]
            or areas["unreviewed_nearby_parallel_branches"]
            or areas["unreviewed_near_name_within_250m"]
            or routes["unrelated_matched_source_paths"] != 1):
        raise ValueError("Import has unreviewed priority candidates or unexpected route placement")
    output = import_dir / "audit-nonoverlaps.md"
    output.write_text(f"""# OpenBeta reconciliation audit

Inputs: OpenBeta `{manifest['release']}` ({manifest['source_routes']:,} distinct
route UUIDs) and the Betabook production catalog dump recorded in
[manifest.json](manifest.json). The generated SQL has been applied to a fresh
local preview and the development database only.

## Import result

| Decision | OpenBeta UUIDs | Physical new climbs |
| --- | ---: | ---: |
| Linked to original Betabook climbs | {routes['source_status'].get('matched', 0):,} | 0 |
| Linked to newly inserted climbs | {routes['source_status'].get('new', 0):,} | {manifest['final_new_climbs']:,} |
| Held for route or area review | {routes['source_status'].get('review', 0):,} | 0 |
| Unsupported or deliberately ignored | {routes['source_status'].get('unsupported', 0):,} | 0 |

The preview contains **{validation['climbs']:,} climbs and {validation['areas']:,}
areas**, compared with {manifest['existing_climbs']:,} climbs and
{manifest['existing_areas']:,} areas in the original dump. It has
{manifest['area_crosswalks']:,} source-area paths and
{manifest['source_routes']:,} route UUID records with source GPS. The import
ignored {manifest['unnamed_routes_ignored']:,} unnamed and
{manifest['ungraded_routes_ignored']:,} ungraded routes. Another
{manifest['unrepresentable_grades_ignored']:,} source grades could not be
stored as Betabook ordinals. **No new climb has a null grade.**

## Area audit

The generator reconciled **{manifest['area_reconciliations']:,} source area
paths** and reparented **{manifest['areas_reparented']:,} existing areas**.
The reviewed final pass consolidated **{manifest['reviewed_original_area_merges_applied']:,}
original or imported duplicate area IDs**, made
{manifest['reviewed_final_parent_moves_applied']:,} additional parent moves,
and corrected {manifest['reviewed_final_source_area_alignments_applied']:,}
source-area crosswalks. Existing climb IDs and their user history remain intact.
The [area merge decisions](reviewed_original_area_merges.csv) include each
survivor ID, old path, child count, and evidence.

The [catalog-wide candidate scan](audit-area-dedupe-candidates.csv) visited
all **{areas['areas_scanned']:,} surviving areas**, including every imported
subarea. The [one-row-per-area inventory](audit-area-inventory.csv) exposes
direct and descendant climb counts, GPS coverage, source crosswalks, and
unresolved candidate counts for each node. Candidate retrieval checks sibling
names and aliases, repeated parent/child labels, same-name parallel branches,
and route and GPS evidence propagated from descendant crags. It also compares
`Uncategorized > Unknown` with named geographic areas. It reports
{areas['candidate_pairs']:,} remaining candidate pairs; {areas['reviewed_holds']:,}
have explicit [semantic hold decisions](reviewed_area_dedupe_holds.csv).
There are **{areas['unreviewed_high_priority']:,} unreviewed original-priority**
pairs and **{areas['unreviewed_semantic_priority']:,} unreviewed expanded-semantic**
pairs in the [ranked queue](audit-area-semantic-priority.csv).
The earlier close-GPS checks have
{areas['unreviewed_nearby_parallel_branches']:,} unreviewed nearby parallel-name
pairs and {areas['unreviewed_near_name_within_250m']:,} unreviewed close near-name
sibling pairs. {areas['reviewed_needs_geography']:,} candidate pairs carry an
explicit **needs geography** hold, which records uncertainty rather than proof
that the areas are distinct. A scan with no candidate signal does not prove an
area is semantically correct: {areas['areas_without_candidate_signal']:,}
areas currently have no signal under these tests. The
[activity-heading worklist](audit-activity-heading-areas.csv) has
{areas['activity_heading_areas']:,} remaining labels ending in routes,
bouldering, or climbing, containing
{areas['activity_heading_direct_climbs']:,} direct climbs. Some are physical
sectors and some need further naming or placement review.
`Uncategorized > Unknown` still has
{areas['uncategorized_unknown_direct_child_areas']:,} direct child areas and
{areas['uncategorized_unknown_direct_climbs']:,} graded direct climbs after
reviewed geographic moves. Without corroborating route or location evidence,
those names remain unanchored instead of being guessed into a country.

Confirmed examples: Newhalem has one surviving area under Upper Skagit
Valley; Squamish Powerline Boulders has one surviving area with both sets of
child boulders; Area 44 retains its specific Brohm Lake and Pillary path;
Chocolate Factory is a sibling of Motherlode under BRRP. The First and Second
Pullouts in Red Rocks keep their original IDs with their routes from the
parenthetical OpenBeta areas. Icicle Creek keeps the original broad area ID
and its child crags. The separate
[Ryan's Wall history](https://www.mountainproject.com/area/106116502/ryans-wall),
[Powerline guide map](https://quickdrawpublications.com/wp-content/uploads/page%20samples/SB4_Bouldering_Areas4.pdf),
[Pillary hierarchy](https://www.mountainproject.com/area/108504059/the-pillary),
and [Chocolate Factory description](https://www.mountainproject.com/area/106229629/chocolate-factory)
corroborate those decisions.

The previously state-level Millennium Boulder mixed Matthews-Winters boulders
with five routes from the distinct Eldorado Canyon Millennium Crag. The
import now puts the boulders at Matthews-Winters and the trad routes in a new
Eldorado Canyon child. [Mountain Project lists Millennium Crag at Eldorado](https://www.mountainproject.com/area/105744246/eldorado-canyon-state-park)
and [the boulder at Matthews-Winters](https://www.mountainproject.com/area/105746206/the-millenium-boulder).
Same-name route evidence is strong but not absolute: Echo Canyon and
McGillivray Canyon each have a Velvet Underground sector. The
[Echo Canyon route record](https://sendage.com/climb/venus-in-furs-velvet-underground-echo-canyon-bow-valley-ab-canada)
explicitly warns about mislogs at the other similarly named sector, so those
areas and their near-grade Venus routes remain distinct.
The guarded [final geographic correction](sql/80-reviewed-final-semantic.sql)
places Ragged Edge and True Grit at Vesper Peak and Mile High Club and
Marvin's Ear at Morning Star Peak. It preserves the original climb IDs and
links two previously held OpenBeta UUIDs. The separate older Vesper boulder
branch remains a semantic hold because its three original climbs have no
independent location evidence.
The same guarded chunk splits thirteen original Ten Sleep routes out of three
legacy Slavery headings into Downpour Wall, Dream Land, Coolsville, and The
Cigar using source route paths and the
[first-party Ten Sleep guide](https://tensleepclimbing.com/wp-content/uploads/2020/07/TenSleep_RANTA_FINAL_07102020.pdf).
It also links fourteen reviewed Ten Sleep OpenBeta UUIDs, moves Downtown beside Mondo
Beyondo in the canyon hierarchy, and removes two empty Slavery area IDs.
One original route, “The ultimate chipped route,” remains in the third
Slavery area pending corroborated location evidence. The
[Downtown area record](https://www.mountainproject.com/area/107059743/downtown)
supports the corrected sibling placement.
One Castle Rock source path had been mapped to the unrelated Sonoma Coast Goat
Rock. The final SQL creates the Castle Rock Goat Rock child, moves the original
Bowling Bawl climb there, and corrects its source-area crosswalk. Chica Bonita
Wall and Lower Right Stacks also fold into the original areas that contain
their matching routes. Twenty accepted original climbs move to their evidenced
BC sectors: Lower Right, Grand Wall Base Area, Slug Boulders, and The
Distillery. The Distillery now sits beneath Area 44; Capone Wall sits beneath
Halfway House. The
[Grand Wall Base hierarchy](https://www.mountainproject.com/area/105806951/grand-wall-base-area)
and [Capone Wall route record](https://sendage.com/climb/fawlty-towers-halfway-house-rogues-gallery-cheakamus-canyon-squamish-bc-canada)
corroborate those branches.

## Route identity audit

The reviewed final SQL re-linked **{manifest['reviewed_final_route_links_applied']:,}
newly imported climb IDs** to preserved original IDs. It moved
{manifest['reviewed_final_route_climb_moves']:,} originals into more specific
source crags before deleting only the fresh duplicate IDs. The
[post-import audit](audit-post-import.json) finds
**{routes['unreviewed_new_original_exact_candidate_pairs']:,} unreviewed
new-versus-original exact-name/near-grade pairs**. Its
{routes['new_original_exact_candidate_pairs']:,} remaining pairs are reviewed
geographic exceptions, including different climbs with the same names in
distant California crags and the two British Columbia Wonderlands. Sit, low,
stand, direct, and pitch variants remain separate.

The [collocated original-climb worklist](audit-collocated-climb-candidates.csv)
contains {areas['same_area_original_climb_pairs']:,} same-area original-ID
pairs with the same normalized name, type, start variant, and near grade.
These are **not deleted by this import**: production sends and journal entries
may reference either original ID. The app's history-aware climb merge is the
appropriate separate operation after those pairs are reviewed. The
[original ancestor/child overlap report](audit-original-climb-overlap-candidates.csv)
contains {routes['original_climb_overlap_candidate_pairs']:,} further
source-linked pairs for that review.

## Remaining work and checks

The [grouped area worklist](area_review_worklist.csv) has
{manifest['area_review_paths']:,} source paths needing identity or placement
review. The generator held {routes['held_area_conflict_new_routes']:,}
would-be new UUIDs across {routes['held_area_conflict_paths']:,} paths with
contradictory accepted route placements. Final review corrected the source
crosswalk at {routes['held_area_conflict_crosswalks_corrected']:,} of those
paths, including Willow Spring, White Rock Spring, and Whippoorwill; their
held route UUIDs still need individual identity review.
The [accepted route placement audit](audit-unrelated-route-areas.csv) now has
**{routes['unrelated_matched_source_paths']:,} residual source path with
{routes['unrelated_matched_routes']:,} accepted links**: Maple Canyon Road.
It is a broad corridor spanning several more specific original walls, so
those existing route IDs stay in their wall areas and 259 source UUIDs on
that path remain held for individual review.
The parquet exposes only the first five area tokens and often repeats one
crag GPS point across its routes, so low-volume hierarchy and GPS outliers
remain review candidates rather than automatic moves.

Validation: {validation['foreign_key_errors']} foreign-key errors,
`{validation['integrity']}` SQLite integrity, and
{validation['new_climbs_without_grade']} new climbs without grades. The
production database has not been changed; follow [apply-order.txt](apply-order.txt)
only after manual spot-checking this local preview.
""")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-dir", type=Path, required=True)
    args = parser.parse_args()
    print(report(args.import_dir))
