# OpenBeta production import record and runbook

**Completed on 2026-09-20 UTC. Do not rerun these SQL files against production.**
Migration `0046_catalog_sources.sql` deployed with [PR #315](https://github.com/betabook-ca/betabook/pull/315).
A fresh public catalog snapshot had the same area and climb identities as the
reviewed baseline; only 25 climbs' send/rating counters changed. Regeneration
produced byte-identical SQL, and all 114 ordered files applied to production.
Four additional exact same-name, same-area routes with grade disagreements were
reviewed and consolidated in
`scripts/openbeta-reviewed-postimport-route-links-v2026-09-20.sql`.
App writes remained enabled; the `areas` and `climbs` ID sequences were
reserved through 27,324 and 292,783 before the import to avoid collisions.
Final production counts: **25,795 areas, 292,563 climbs, 16,909 area source
links, and 230,548 route source links** (20,430 matched; 151,368 new; 21,710
review; 37,040 unsupported). All 141,205 original climb IDs, 10,220 sends,
and 9,382 journal entries were retained; `PRAGMA foreign_key_check` returned
no rows and send aggregates matched their sends. D1 rejected
`PRAGMA integrity_check` as unauthorized; the final public-only SQLite preview
returned `ok`. Automatic approval review rejected a full production export
because it would copy private member data locally. The pre-import D1 Time
Travel bookmark is retained only in the local, Git-ignored execution metadata.
The remaining original-only same-area route collisions are documented in
[the separate audit](openbeta-original-duplicate-audit.md).

The procedure below is preserved as an execution record and is not a repeatable
import command. The public catalog snapshot, parquet, generated SQL, and
execution metadata are Git-ignored and are not included in this PR.

This runbook is for the manually reviewed `v2026-09-13` import rebased to the
current public production catalog in
`artifacts/openbeta-2026-09-13-current/rebased`. It was applied to production
on 2026-09-20 UTC.
Use the SQL in that directory, not the local SQLite preview file. Work from the
repository root on a machine with Wrangler access to the configured
`betabook-db` D1 database.

**Use only the rebased files.** The earlier SQL under
`artifacts/openbeta-2026-09-13/sql` is stale and will fail its first guard.
A read-only production check after the rebase matched this snapshot: 10,239
areas (maximum ID 10,239) and 141,205 climbs (maximum ID 141,206).
Production can change again; repeat the read-only check immediately before
the import. Do not bypass the guard if it fails.
The remote provenance tables were absent in the captured baseline; migration
`0046_catalog_sources.sql` deployed before the SQL import.
The fresh snapshot was collected using only public catalog columns:

```bash
python3 scripts/openbeta-fetch-public-catalog.py --database DB \
  --output artifacts/openbeta-2026-09-13-current/catalog-production-current.sql \
  --batch-size 2000
```

That output and the generated SQL under `artifacts/` are ignored by Git; keep
them available on the machine that will perform the manual import. The
reviewed curation and generator are in `scripts/`.

## Go/no-go before a production write

1. Read the local reconciliation audit at
   `artifacts/openbeta-2026-09-13-current/rebased/audit-nonoverlaps.md`
   and spot-check the local app. The import holds 21,710 source routes for
   review. Forty area candidate pairs still need geography evidence; those
   are not silently merged.
2. Decide whether old area URLs must continue working. The SQL removes 260
   **original area IDs** after moving their climbs and children to surviving
   areas. Original **climb IDs are preserved**, so sends and journal entries
   remain linked, but a bookmarked URL for a removed area ID will currently
   return 404. Add area-ID redirects before importing if that matters to the
   product.
3. Pause app writes and verify that production still matches the catalog-only
   snapshot used to generate this import. Fetch a new public-only snapshot to a
   different path and compare it byte-for-byte:

   ```bash
   check_dir=$(mktemp -d /tmp/betabook-openbeta-check.XXXXXX)
   python3 scripts/openbeta-fetch-public-catalog.py --database DB \
     --output "$check_dir/catalog.sql" --batch-size 2000
   cmp "$check_dir/catalog.sql" \
     artifacts/openbeta-2026-09-13-current/catalog-production-current.sql
   ```

   Stop if `cmp` reports a difference; regenerate and review the import against
   the changed catalog. The initial SQL guard requires 10,239 areas
   (maximum ID 10,239), 141,205 climbs (maximum ID 141,206), and empty catalog
   source tables. Counts alone do not detect an edit to an existing row. Keep
   app writes paused through the import and verification.

4. Land the code and migration `0046_catalog_sources.sql` through the normal
   reviewed deployment. A push to `main` applies remote migrations and then
   deploys the Worker. Confirm the migration is present before importing.
   `pnpm deploy` alone skips migrations.

## Prepare a recovery point

Choose a maintenance window and prevent app writes and competing deploys for
the whole import and verification. Wrangler warns that D1 can be unavailable
while processing a SQL file; the 114 ordered files are separate imports, not
one transaction. A failed file rolls back that file, but earlier successful
files remain applied.

Record a D1 Time Travel bookmark immediately before the import, and optionally
export an additional SQL copy to a secure local path:

```bash
pnpm exec wrangler d1 time-travel info DB
pnpm exec wrangler d1 export DB --remote --output /secure/path/betabook-before-openbeta.sql
```

Cloudflare documents [Time Travel bookmarks](https://developers.cloudflare.com/d1/reference/time-travel/)
and [D1 export](https://developers.cloudflare.com/d1/wrangler-commands/).
Keep the bookmark and export private: a full export can contain member data.
Restoring a bookmark overwrites all changes since that point, including user
activity, which is why writes must remain paused until verification ends.

## Check the target, then apply in order

The read-only count query must match the catalog snapshot above:

```bash
pnpm exec wrangler d1 execute DB --remote --command \
  "SELECT (SELECT COUNT(*) FROM areas) AS areas, (SELECT MAX(id) FROM areas) AS max_area_id, (SELECT COUNT(*) FROM climbs) AS climbs, (SELECT MAX(id) FROM climbs) AS max_climb_id"
pnpm exec wrangler d1 execute DB --remote --command \
  "SELECT (SELECT COUNT(*) FROM catalog_area_sources) AS area_sources, (SELECT COUNT(*) FROM catalog_route_sources) AS route_sources"
```

After the migration is present and the bookmark is saved, run the guarded SQL
files **serially**. Stop on any error; do not restart the loop at the first
file against a partially imported database.

```bash
set -euo pipefail
while IFS= read -r part; do
  pnpm exec wrangler d1 execute DB --remote --yes \
    --file="artifacts/openbeta-2026-09-13-current/rebased/sql/$part"
done < artifacts/openbeta-2026-09-13-current/rebased/apply-order.txt
```

The rebased import was tested file by file against a disposable local Wrangler
D1 database: all 114 ordered files passed. The resulting `areas`, `climbs`,
`catalog_area_sources`, and `catalog_route_sources` rows matched the reviewed
SQLite preview exactly. This is a local compatibility test, not a remote
production rehearsal. Each generated SQL statement is under 100 KB; Cloudflare
documents the [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Verify before resuming writes

The 114-file import and the four reviewed route corrections had these counts:

| Table or source status      | After 114 files | Final after correction |
| --------------------------- | --------------: | ---------------------: |
| `areas`                     |          25,795 |                 25,795 |
| `climbs`                    |         292,567 |                292,563 |
| `catalog_area_sources`      |          16,909 |                 16,909 |
| `catalog_route_sources`     |         230,548 |                230,548 |
| route sources `matched`     |          20,426 |                 20,430 |
| route sources `new`         |         151,372 |                151,368 |
| route sources `review`      |          21,710 |                 21,710 |
| route sources `unsupported` |          37,040 |                 37,040 |

`PRAGMA foreign_key_check` should return no rows. Also open representative
production area pages, including Newhalem, Powerline Boulders, Icicle Creek,
Downpour Wall, The Distillery beneath Area 44, and Castle Rock's Goat Rock.
Check that a member's existing send and journal entry still opens the same
climb ID. Resume writes only after all checks pass.

If an import file fails, keep writes paused. The safest recovery is to restore
the recorded bookmark, diagnose the failed file on a fresh local copy, then
start the reviewed import again. A Time Travel restore is destructive to
post-bookmark activity; never use it after writes resume without accounting
for those writes.
