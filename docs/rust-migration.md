# Rust Cloudflare Workers Migration Roadmap

Betabook is migrating incrementally from Next.js / `vinext` to a unified Rust Cloudflare Worker (`workers-rs` + `axum` compiled to `wasm32-unknown-unknown`) paired with a plain Vite + React Router SPA served via Cloudflare Workers Static Assets.

## Target Architecture

- **`crates/betabook-domain`**: Pure Rust domain logic with zero runtime/FFI dependencies — climbing grades (`BOULDER_HUECO`, `ROPE_YDS`, Font/French scales), URL slugification, profile photo key validation/sniffing, terms constants, security headers, Better Auth-compatible scrypt password verification/hashing, and SEO/sitemap/JSON-LD builders.
- **`crates/betabook-db`**: Async `DbExecutor` trait (`#[async_trait(?Send)]`) with two backends:
  - `sqlite` (`rusqlite` bundled, native tests) — runs all `drizzle/migrations/*.sql` in-memory for millisecond invariant testing.
  - `d1` (`worker::D1Database`, `wasm32`) — production/Wrangler D1 backend preserving Betabook's single-CTE-reference SQL discipline (`SQLITE_LIMIT_EXPR_DEPTH <= 100`).
- **`crates/betabook-worker`**: Single `axum` router inside Cloudflare Workers (`#[event(fetch)]` and `#[event(scheduled)]`), handling:
  - Full Rust authentication (`/api/auth/*`, `/api/terms/*`) compatible with existing D1 `user`/`session`/`account`/`verification` tables, scrypt password hashes, and signed session cookies.
  - Public catalog & search APIs, avatar R2/Cache-API serving, and weekly streaming multipart R2 catalog exports.
  - SEO routes (`/robots.txt`, `/sitemap-index.xml`, `/sitemap/:shard`), canonical slug 308 redirects, and `ASSETS` HTML `<meta>` / JSON-LD injection.
- **`spa/`**: Plain Vite + React 19 + HeroUI v3 + Tailwind v4 SPA using React Router and thin `next/*` compatibility shims so `components/` and `hooks/` port without a UI rewrite.

## Local Verification Commands

```bash
# Rust formatting, lints, and native SQLite tests
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Compile the Cloudflare Worker WASM bundle
(cd crates/betabook-worker && worker-build --release)

# Run locally against Wrangler + local D1/R2 state
pnpm exec wrangler dev -c crates/betabook-worker/wrangler.rust.jsonc --port 8787 --persist-to .wrangler/state --test-scheduled

# Keep existing vinext checks green during migration
pnpm check && pnpm build
```

## Migration Stacks

1. **Foundation Stack** (`rust-migration/*`): Workspace + CI, domain & DB core, full Rust auth & core public/R2 APIs, and React Router SPA foundation.
2. **Sends, Journal, Feed & Friends**: Port remaining read/write APIs and client views for logging ascents, journal entries, activity feed, and friendships.
3. **Trips, Goals, Projects, Lists & Analytics**: Port share-link predicates, trip day grouping, Google Photos album caching, goal refresh, climb lists, and analytics.
4. **Moderation, Imports & Admin**: Port area-scoped moderation queue/actions, KAYA / Sendage / Mountain Project / CSV importers, and profile photo upload/resizing.
5. **Cutover**: Point root `wrangler.jsonc` at the Rust Worker + SPA `dist-spa`, remove `next`, `vinext`, `drizzle-orm`, `better-auth`, and Next-specific shims.
