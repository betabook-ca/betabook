#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repo_root"

python_bin="${1:-python3}"
catalog_sql="${2:?Pass the reviewed catalog-only production snapshot as the second argument}"
output_dir="${3:?Pass the import output directory as the third argument}"

"$python_bin" scripts/openbeta-reconcile.py \
  --catalog-sql "$catalog_sql" \
  --parquet artifacts/openbeta-2026-09-13/openbeta-climbs.parquet \
  --release v2026-09-13 \
  --output "$output_dir" \
  --audit-candidates scripts/openbeta-curation-v2026-09-13.csv \
  --audited-promotions scripts/openbeta-promotions-v2026-09-13.csv \
  --distinct-crags scripts/openbeta-distinct-crags-v2026-09-13.csv \
  --subarea-corroborations scripts/openbeta-subarea-corroborations-v2026-09-13.csv \
  --area-placement-exceptions scripts/openbeta-area-placement-exceptions-v2026-09-13.csv \
  --reviewed-source-branches scripts/openbeta-force-source-branches-v2026-09-13.csv \
  --reviewed-area-alignments scripts/openbeta-reviewed-area-alignments-v2026-09-13.csv \
  --reviewed-parent-moves scripts/openbeta-reviewed-parent-moves-v2026-09-13.csv \
  --rejected-matches scripts/openbeta-rejected-matches-v2026-09-13.csv \
  --reviewed-area-holds scripts/openbeta-reviewed-area-holds-v2026-09-13.csv \
  --reviewed-new-releases scripts/openbeta-reviewed-new-releases-v2026-09-13.csv \
  --reviewed-area-aliases scripts/openbeta-reviewed-area-aliases-v2026-09-13.csv \
  --reviewed-pre-match-parent-moves scripts/openbeta-reviewed-pre-match-parent-moves-v2026-09-13.csv \
  --reviewed-route-moves scripts/openbeta-reviewed-route-moves-v2026-09-13.csv \
  --reviewed-source-parent-conflicts scripts/openbeta-reviewed-source-parent-conflicts-v2026-09-13.csv \
  --reviewed-original-area-merges scripts/openbeta-reviewed-original-area-merges-v2026-09-13.csv \
  --reviewed-final-parent-moves scripts/openbeta-reviewed-final-parent-moves-v2026-09-13.csv \
  --reviewed-final-climb-moves scripts/openbeta-reviewed-final-climb-moves-v2026-09-13.csv \
  --reviewed-final-source-area-alignments scripts/openbeta-reviewed-final-source-area-alignments-v2026-09-13.csv \
  --reviewed-final-route-links scripts/openbeta-reviewed-final-route-links-v2026-09-13.csv \
  --reviewed-final-semantic scripts/openbeta-reviewed-final-semantic-v2026-09-13.json
