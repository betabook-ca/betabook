# Database queries

Keep ownership, privacy and scope predicates in the SQL that reads or writes each row. Use the native SQLite executor and checked-in migrations for integration tests.

## Database-managed state

migrations own FTS synchronization, send aggregates, area cycle guards, journal/send invariants, and project, trip and list share revocation when a profile goes private. Do not replace these with partial application-side updates. Account deletion has explicit cleanup in `backend/db/src/auth.rs` to preserve aggregates. Successful mutations refresh affected SPA views through the action client in `frontend/src/spa/lib/actions-client.ts`.

## D1 statement size

SQLite copies a CTE body into every place that names it, including the CTEs inside it. Production D1 keeps one count per statement of the FROM items it expands: each copied CTE body and each subquery with a FROM clause, flat or nested. It checks that count against `SQLITE_LIMIT_EXPR_DEPTH` (100) when it resolves a CTE reference, so a statement with 120 small subqueries and one CTE reference after them fails, while the same statement with the reference first passes ([cloudflare/workerd#8389](https://github.com/cloudflare/workerd/issues/8389)). Since 2026-11-08 ([cloudflare/workers-sdk#16786](https://github.com/cloudflare/workers-sdk/issues/16786)) a statement over the limit fails as a whole with `VIEWs and/or subqueries nested too deep`, and `AS MATERIALIZED` does not avoid it. Naming a CTE once is not enough on its own: count the subqueries around it too. Name each CTE once where you can. Take counts, ranks and positions from window functions over one CTE instead of joining it to an aggregate of itself, and carry columns forward instead of joining an earlier CTE again. Visibility predicates such as `journal_visible_sql` are `EXISTS` subqueries, so each copy of a CTE that uses them adds their tables as well. `get_feed_page` is the worked example: it named `activity` three times and failed in production. A workerd older than production D1 runs such a statement without error, so check a large new statement on a current workerd.
