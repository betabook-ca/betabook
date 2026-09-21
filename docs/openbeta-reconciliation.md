# OpenBeta catalog reconciliation

## Input and scope

The input is the official `openbeta-climbs.parquet` release and a Betabook catalog
dump containing `areas` and `climbs`. Record the release URL, SHA-256, row counts,
and the Betabook maximum IDs with every generated import. The September 13, 2026
parquet has 231,924 rows and 230,548 distinct climb UUIDs; its 1,376 repeated
rows are byte-for-byte duplicate records. Deduplicate by UUID before matching.
Fetch this pinned release from
`https://github.com/OpenBeta/parquet-exporter/releases/download/v2026-09-13/openbeta-climbs.parquet`
to `artifacts/openbeta-2026-09-13/openbeta-climbs.parquet` and verify SHA-256
`b32713d7be5ff8b7dd14ec0bab48bfc85e2b1690429a29cf98d56b6115285f5c`.
The parquet and generated SQL stay outside Git.
The current reviewed import uses a catalog-only production snapshot with
10,239 areas and 141,205 climbs in
`artifacts/openbeta-2026-09-13-current/catalog-production-current.sql`.
It supersedes the earlier 10,237-area/141,199-climb dump. Reviewed generated
area references were rebased by exact path and generated climb references by
OpenBeta UUID, then the entire SQL was rebuilt and validated. Production's
new `The Lost World` sibling folds into the established area while retaining
its new climb ID; `Road Rage` remains a distinct Brohm Lake area. A generic
OpenBeta `Corner` in Terrace moved from automatic new to review after a much
harder production `The Corner` was added in Squamish.

The parquet exposes only `country`, `state_province`, `region`, `area`, and `crag`.
These are the first five OpenBeta path tokens, **not necessarily the full crag
path**. There is no safe way to infer omitted descendants from this file. Keep a
more detailed Betabook placement when OpenBeta stops at a broader node.
Before matching or writing SQL, decode OpenBeta text with Betabook's existing
`lib/html-entities.ts` helper. This handles encoded and twice-encoded entity
references in route names, descriptions, grades, and area labels without
changing bare ampersands or references lacking a semicolon.

## Identity and placement rules

1. A source UUID is the stable OpenBeta identity. A climb name alone never
   identifies a route. Normalize Unicode, punctuation, spacing, and harmless
   leading articles for candidate retrieval, while retaining original spelling
   for records. The normalized form is not a display name. Placeholder names
   such as `Unnamed`, `Unknown 5.8 Face`, and grade-only labels are ignored for
   climb import; their UUIDs and GPS remain in the source crosswalk with an
   unsupported status. Distinct titles such as `Unknown Pleasures` remain
   eligible. Ignore source climbs whose applicable grade is blank or a
   placeholder, before route matching or area placement. Keep their UUID and
   GPS in the crosswalk with `ungraded_route_ignored`. A real source grade
   that cannot map to Betabook's ordinal scale may still support a match to
   an existing climb, but never creates a new climb with a null grade; such
   otherwise-new routes receive `unrepresentable_grade_ignored`.
2. Classify `sit start`/`SDS`, `low start`, `stand start`, and unspecified starts
   separately. A conflicting classification forbids an automatic match, even
   if the route name, grade, and area otherwise agree. A bare `Low` suffix means
   low start; words such as `Low Road` do not.
3. Block route candidates by country/state when those are reliable. Within the
   block, score name, discipline, grade, and ordered area ancestry. Allow skipped
   area levels and fuzzy area spelling. Repeated names require stronger ancestry
   evidence and a clear margin over the runner-up. Coordinates in this export
   are frequently shared by all routes in a crag, so they do not identify a route.
4. Match an OpenBeta area to an existing Betabook area only when its name and
   ancestors agree within the country/state boundary. Create missing OpenBeta
   descendants beneath the deepest safe anchor. A route match can add evidence
   for an area alignment, but cannot override a geographic conflict. Treat
   `Bouldering` headings as activity labels: discard a standalone or redundant
   heading, and remove the suffix from geographic labels such as `Flagstaff
Bouldering`. Keep physical feature names such as `The Bouldering Wall`.
5. For an accepted route match, preserve the Betabook ID, grade, type,
   description, sends, and ratings. Move it to a confidently mapped descendant
   of its current area. When accepted route identities tie a same-named
   Betabook area to a source path with additional trustworthy parents,
   reparent that existing area instead of creating a duplicate leaf. Its ID,
   deeper Betabook subareas, and climbs remain together. If both hierarchies
   have equal depth, retain the existing area and place new source climbs
   there. Contradictory intermediate areas stay for review.
6. Sport and trad are separate catalog types. Boulder and rope never merge.
   OpenBeta routes with multiple type flags may match any explicitly listed
   type; new routes with ambiguous rope types need review. Top-rope-only and
   unclassified routes cannot be represented by Betabook's current type enum
   and are held out of the import.
7. Grades are supporting evidence, not identity. Parse exact V/YDS grades to
   Betabook ordinals. Approximate modifiers and ranges only for new routes,
   recording the original text and approximation in the review manifest.
   Never overwrite an existing grade using a fuzzy match.

## Decision tiers and generated artifacts

- **Match:** unique high-confidence candidate. Keep its existing ID; optionally
  move it to a proven descendant and fill an empty description only after review.
- **New:** no plausible Betabook counterpart within the geographic block. Insert
  with explicit IDs after the current maximums, using parent-first area inserts.
- **Review:** competing candidates, weak geography, near-name candidates, start
  variant conflicts, ambiguous types, incompatible area branches, or a same
  named route within a state/province or OpenBeta region even if the paths
  disagree. Do not
  invent a match or insert a possible duplicate. Export all evidence to CSV.
- **Unsupported:** no Betabook discipline, usable location, or importable grade.
  Export separately. This includes ignored unnamed and ungraded climbs,
  identified by `unnamed_route_ignored` and `ungraded_route_ignored` in the
  source decision.

The generator emits a guarded, ordered set of SQL chunks plus CSV manifests for
matches, new routes, unresolved routes, area mappings, and grade conversions.
Migration `0046_catalog_sources.sql` was applied before the SQL chunks. The
guard checks catalog counts, maximum IDs, and empty source tables before any
catalog insert.
Every proposed new ID is deterministic for the same input. SQL is intended for
manual production application only after the local import and review. This
release-specific generator cannot be rerun against the already imported
catalog: the guard requires empty source tables. A future release needs an
incremental importer that resolves known source UUIDs first.
The 114-file preview has 292,567 climbs. A guarded production correction linked
four exact same-name, same-crag routes to original climb IDs despite larger
grade disagreements, leaving 292,563 climbs. The reviewed correction is
`scripts/openbeta-reviewed-postimport-route-links-v2026-09-20.sql`; it is an
execution record, not a migration or a script to rerun.

`catalog_route_sources` retains every deduplicated OpenBeta UUID, source
name/path, release, status, match evidence, and original latitude/longitude.
Accepted matches and new routes link to `climbs.id`; held routes keep a null
`climb_id`. `catalog_area_sources` retains the alignment of each exported path
to a Betabook area, or an unresolved status. The composite `(source, source_id)`
route key can also hold Mountain Project IDs when they are actually available;
the OpenBeta UUID in this parquet must not be assumed to be a Mountain Project
ID. Future imports should check a verified external ID first, use the area
crosswalk as a search anchor second, then fall back to fuzzy reconciliation.
Coordinates are source provenance, not a claim of an exact route location:
OpenBeta often repeats one crag point across many routes. Some exported points
are plainly wrong; `audit-gps-discordant-descendants.csv` compares new route
points with trusted matched routes beneath the same original area, including
when the new route maps to a generated child. Review these outliers before
using GPS as evidence in a later import. A large park or regional area can
legitimately span more than 50 km, so the report is not an automatic rejection.

The September 2026 audit adds a release-specific curation CSV through
`--audit-candidates`. It holds plausible fuzzy overlaps and previously reviewed
UUIDs without forcing a merge. Sit, low, direction, route-number, and pitch
qualifiers remain distinct. `area_reconciliations.csv` records every parallel
path resolved through route evidence, its original and final area paths, and
whether the existing area was reparented or retained. `parallel_area_review.csv`
and `parallel_move_review.csv` contain only paths that still have conflicting
evidence. The ordered SQL applies new parent areas before reparenting existing
areas and moving any accepted climbs from a broad ancestor into the reconciled
area.

Two further audited CSVs can be supplied with `--audited-promotions` and
`--distinct-crags`. The first links unique, corroborated same-route identities
to existing Betabook IDs without moving them. The second releases repeated
names at different named crags when all namesakes are over 20 km away and no
cross-level area alias or original Betabook candidate remains. Their hashes
are recorded in the import manifest. Byte-identical OpenBeta payloads with
different UUIDs share one physical climb only for distinctive single-type
routes with one unambiguous destination; generic/placeholder names stay held.

`--subarea-corroborations` supplies reviewed route clusters where two or more
distinctive routes have exact names, types, and grades, and they cover every
climb in one original Betabook leaf area. The generator verifies those gates
before moving that leaf beneath the more detailed source path. This places
Betabook's `Watchman boulder` beneath `Badger Flats` while preserving its two
climb IDs and the boulder name.

When a same-named original area is directly under a state/province, the source
may still supply trustworthy missing parents that were skipped during name
alignment. The area name can be the source path's terminal token, as with
Flagstaff, or an intermediate token, as with Leavenworth. Two distinct accepted
route matches and compatible geographic prefixes allow the existing area
subtree to move under those source parents. A conflicting existing child blocks
the move. The area decision and parent update are recorded in
`area_reconciliations.csv` and `area_reparents.csv`.

`--area-placement-exceptions` records source parents contradicted by stronger
location evidence. For example, OpenBeta groups Niagara Glen under Conservation
Halton Parks, while [Niagara Parks places Niagara Glen in Niagara Falls](https://www.niagaraparks.com/visit/attractions/niagara-glen-nature-centre).
The route identities still link, but the original Niagara Glen area remains
under Ontario with `source_parent_conflict` in its area crosswalk.

Release-specific semantic decisions are separate, hashed CSV inputs. Reviewed
source-branch rows correct generic leaf-name anchors that crossed regions;
reviewed area alignments and parent moves place original area IDs under verified
geographic parents; reviewed area holds keep new climbs out of unresolved
duplicate-original-area branches. Every correction checks an expected prior
path, original ID, route count, or parent before generating SQL. The output
CSV files retain those decisions for manual review. A route-name match alone
does not establish that two named regions have a parent-child relationship.

`--reviewed-pre-match-parent-moves` applies independently verified geographic
parents before route matching. This lets a source route in Bishop Area search
the original Bishop subtree after Bishop moves beneath Sierra Eastside.
`--reviewed-area-aliases` handles a stronger same-place finding: it folds the
source planning area into the original Betabook area ID, moves source children
under that ID, and reruns route matching against the new tree. Each alias row
requires a minimum number of unique original climb names with matching type,
start variant, and near grade, along with a reviewed geographic source. A
source route still cannot match an original climb in a different named child
crag merely because their broad areas are aliases. The generated
`reviewed_area_alias_decisions.csv` records every applied fold.
`--reviewed-route-moves` places a matched original climb in a more accurate
source crag only after its UUID, original climb ID, original area, name, type,
grade, source path, and target path pass exact guards. Independent route-level
evidence is required. This prevents a broad sibling-area rule from moving a
climb out of an already more specific Betabook crag. The preview audit reports
original climb pairs with the same name, type, and near grade in ancestor and
descendant areas; it does not silently delete either original ID.

The preview audit also writes `audit-source-prefix-ancestry.csv`: source paths
whose named parents do not overlap the mapped original area's parents. It is
a semantic review queue, since a missing parent, a regional spelling alias,
and an incorrect same-name crag can look alike to string matching. Known
wrong-branch paths are corrected with guarded `--reviewed-source-branches`
rows. Even a path with zero imported climbs must have its source crosswalk
corrected, or it could mislead a later Mountain Project import.
`--reviewed-source-parent-conflicts` marks a false source prefix when its leaf
is correctly mapped to an original Betabook area. For example, Grand Forks is
kept under Boundary Country even though OpenBeta lists it under Kootenays
West. These crosswalk rows retain the leaf mapping with
`source_parent_conflict` quality for future imports.
`audit-missing-source-parents.csv` additionally checks ordered source ancestry
above an existing original area, including where matched source paths map to
new descendants of that original. This catches skipped regional parents that
an exact leaf-name match can otherwise conceal.
`audit-missing-source-parent-priority.csv` groups the highest-volume cases.
The release-specific `openbeta-priority-parent-decisions-v2026-09-13.csv`
classifies each such group as an activity or area alias, a false source parent,
a more specific original placement, a repeated source name, or an original-ID
duplicate held for review. The local audit fails if any priority group lacks
a reviewed classification.

The area dedupe audit scans **every original and imported area**, including
descendants, with `scripts/openbeta-audit-area-dedupe.py`. It reports sibling
names that normalize identically, close sibling spellings, parenthetical
aliases, repeated or activity-qualified parent/child names, and parallel
same-name branches across a state or province. It compares route-name/type/
start/near-grade signatures and source GPS across whole descendant subtrees,
since a regional area may have no direct routes. A shared GPS point only
promotes review: neighboring cliffs often inherit the same coarse source
coordinate. The `audit-area-inventory.csv` has one row for each surviving node
with direct/subtree route counts, child counts, GPS and source-crosswalk
coverage, and unresolved pair counts. `audit-area-dedupe-candidates.csv`
contains full paths, signal classes, route examples, and distances;
`audit-area-semantic-priority.csv` ranks unreviewed high-impact candidates.
`audit-activity-heading-areas.csv` exposes remaining areas whose names end in
Routes, Bouldering, or Climbing. The summary distinguishes zero **detected**
high-priority candidates from proof of geographic correctness, and counts
`needs_geography` holds separately. Boulder fields versus roped walls, named
individual boulders versus their surrounding areas, directional sectors, and
nearby crags with duplicated route records can look alike to a name matcher
but must remain separate areas.
The audit also compares original climbs under `Uncategorized > Unknown` with
the geographic catalog using distinctive route names, grades, types, and area
name similarity. These candidates need semantic review: a matching route can
mean the unknown area is the same crag, a narrower crag within a broad known
region, or an erroneous duplicate route record. It never moves an area from
Unknown based on a generic route title alone.
`audit-collocated-climb-candidates.csv` separately lists same-area climb IDs
with the same normalized name, type, and start variant at near grades. It
includes historical send counts and OpenBeta link counts so duplicate climb
identity can be reviewed without deleting a user's route history.

`--reviewed-original-area-merges` is the release-specific, hashed list of
semantically confirmed area merges. Despite the historical option name, it
also accepts imported area IDs. Its final SQL chunk transfers source area
links, direct climbs, and child areas to the survivor before deleting the
duplicate; all climb IDs and their sends remain intact. It can rename a
survivor to the better source spelling or place it under a verified new
parent. For sibling merges, area grants are copied to the survivor. A merge
into an ancestor is guarded against widening an existing grant. Pending
moderation requests and nonempty descriptions on a removed area also block
the SQL. The preview builder verifies every removed original area, moved
original climb, renamed survivor, and changed parent, then checks foreign
keys and SQLite integrity. Existing duplicate climb IDs exposed by an area
merge require a separate history-aware climb merge review.
`--reviewed-final-parent-moves` applies reviewed geographic containment after
area IDs are consolidated. This keeps physical boulder clusters beneath their
broader lake or town while removing source-only activity branches.
`--reviewed-final-climb-moves` moves a precisely identified original climb to
an independently verified neighboring crag before a duplicate area is
removed. Each row guards its climb ID, old area, name, type, grade, and new
area; the climb ID and all user records remain intact.
`--reviewed-final-source-area-alignments` upgrades exact OpenBeta source paths
whose area mapping was ambiguous only because duplicate area IDs had not yet
been consolidated. Its SQL runs last, checks the old area and quality, and
sets a reviewed canonical area ID for later imports. The held route UUIDs on
those paths remain held until their own climb identities are reviewed.
After a reviewed area consolidation, an imported route can land beside an
original climb with the same normalized name, start variant, type, and near
grade. `--reviewed-final-route-links` records individually reviewed UUID and
climb-ID pairs. Its final SQL checks exact names, grades, expected final areas,
an ancestor relationship when needed, and absence of user history on the
fresh imported ID. It moves an original climb down to a verified specific
source child when appropriate, links all source UUIDs to the original climb,
then deletes only the unused imported ID. The source grade and GPS remain in
the route crosswalk. Separate sit, low, direct, and pitch variants stay
separate. Unrelated same-name branches remain in the route review worklist.
The post-import audit accepts a separate reviewed geography-exception CSV
through `--route-exceptions`. It marks same-name new/original pairs as
deliberately distinct only when the exact UUID and both climb IDs still form
an audit candidate. This covers homonymous routes at independently verified
faraway crags without suppressing future overlap detection.

The release-specific final semantic SQL handles a narrow case that the
five-token source path cannot express: Mountain Project places Washington's
Ragged Edge and True Grit on [Vesper Peak](https://www.mountainproject.com/area/111130491/vesper-peak),
while Mile High Club and Marvin's Ear are on
[Morning Star Peak](https://www.mountainproject.com/area/112553799/morning-star-peak).
`openbeta-reviewed-final-semantic-v2026-09-13.sql`
guards the original IDs, names, grades, source UUIDs and path before making a
new Morning Star area, placing the four routes, and linking two held UUIDs to
preserved original climb IDs. It also creates a Castle Rock-area Goat Rock
instead of mapping that source path to the unrelated Sonoma Coast Goat Rock;
the original Bowling Bawl ID moves into the new area. The same guarded chunk removes activity words
from nine verified geographic area labels while retaining their IDs and source
crosswalks and adopts three source-supported area spellings. Its companion
JSON records every expected area, climb, and
source-link change; the preview builder verifies them after applying SQL. The
older same-named Vesper boulder branch stays separate pending
independent evidence of its location.
The same final pass splits legacy Ten Sleep `Slavery` route placement across
Downpour Wall, Dream Land, Coolsville, and The Cigar. The source UUIDs and
[Ten Sleep guide](https://tensleepclimbing.com/wp-content/uploads/2020/07/TenSleep_RANTA_FINAL_07102020.pdf)
support thirteen original climb moves and fourteen source relinks. It preserves
all climb IDs, folds source Downpour Wall into the original Downpour area ID,
and moves the original Downtown area beside Mondo Beyondo as the
[Downtown climbing record](https://www.mountainproject.com/area/107059743/downtown)
shows. Two empty Slavery areas are deleted only after guarded moves and
reference checks. The remaining old Slavery area keeps one original route
without corroborated placement.
Accepted source UUIDs provide route-level evidence for narrower BC placement:
the final SQL moves twelve originals into Lower Right Stacks, six into Grand
Wall Base Area, Moon Moves into Slug Boulders, and Still the Spirits into The
Distillery. The original Lower Right area and its source-only duplicate are
consolidated; The Distillery is nested under Area 44 and Capone Wall under
Halfway House. [Mountain Project distinguishes Grand Wall Base Area](https://www.mountainproject.com/area/105806951/grand-wall-base-area),
while the [Fawlty Towers route record](https://sendage.com/climb/fawlty-towers-halfway-house-rogues-gallery-cheakamus-canyon-squamish-bc-canada)
supplies the Capone Wall hierarchy. Maple Canyon Road remains an intentional
broad source path because its accepted route identities span several more
specific original walls.

After all area moves and generated-area merges, the generator compares each
accepted source route's mapped area with its Betabook climb's final area. If
those branches remain unrelated, it keeps accepted route identity links but
holds new routes on the same source path for area review. The path-level
`route_evidence_area_conflicts.csv` identifies the remaining decisions. A
separate preview audit checks for exact-name/near-grade new-versus-original
duplicates, same-name original/generated area siblings, GPS-discordant area
anchors, and foreign-key errors. Its output is `audit-post-import.json` plus
focused CSV worklists.

## Local validation

Import the production catalog into a fresh, migrated local D1 copy, apply the
generated SQL in order, and check referential integrity, counts, start variants,
duplicate name clusters, and representative crags. Preserve a backup of the
previous local D1 database before changing it. The production dump is a catalog
snapshot; its aggregate send counts are historical values and there are no
corresponding send rows in the dump, so the local preview cannot validate send
history or live aggregate triggers for old routes.
