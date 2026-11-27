# Rust backend

Keep business rules in `domain/`, parameterized SQL and atomic mutations in `db/`, HTTP handlers and Cloudflare bindings in `worker/`, and versioned SQL in `migrations/`. Native tests use SQLite. The release Worker runs on wasm32 with D1 and R2.

Preserve existing credential hashes, session cookies, migrations, public URLs, and R2 keys. Enforce permissions in the handler and in the database statement. Keep credentials in Worker bindings and redact personal information, session tokens, and share links from logs.

Versioned SQL in `backend/migrations/` defines the schema, including indexes and triggers. Run `pnpm db:generate add_feature` to create the next numbered SQL file, then write and review the migration. Keep existing migration names and contents intact. CI applies migrations before deployment, so the running Worker must remain compatible. Run `pnpm db:migrate:local` after pulling or adding migrations. `pnpm setup` skips migration for an existing database.

For changes to D1 queries, indexes or triggers, read the [database rules](db/AGENTS.md). For routes, metadata, bindings or API generation, use the [Worker guide](worker/AGENTS.md). For audience or share-link changes, read [visibility](../docs/features/visibility.md) or [trip access](../docs/features/trips.md#audience-and-notes). Other cross-stack rules are grouped by [feature](../docs/features/).

Run `mise run rust-check` for native tests, native and WASM Clippy, and rustfmt. Run `cargo deny --locked check advisories` for dependency advisories. For HTTP or binding changes, build the release and run the [workerd tests](../tests/worker/AGENTS.md).
