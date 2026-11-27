# Rust Worker migration

Betabook runs on a unified Rust Cloudflare Worker (`workers-rs` + `axum` compiled to `wasm32-unknown-unknown`) paired with a plain Vite + React Router SPA served via Cloudflare Workers Static Assets.

## Architecture

- **`backend/domain`**: Pure Rust domain logic with zero runtime/FFI dependencies — climbing grades (`BOULDER_HUECO`, `ROPE_YDS`, Font/French scales), URL slugification, safe Markdown-to-HTML rendering (`markdown::render_safe_markdown` via `pulldown-cmark` so readers avoid client Markdown JS), profile photo key validation/sniffing, terms constants, security headers, Better Auth-compatible scrypt password verification/hashing, and SEO/sitemap/JSON-LD builders.
- **`backend/db`**: Async `DbExecutor` trait (`#[async_trait(?Send)]`) with two backends:
  - `sqlite` (`rusqlite` bundled, native tests) — runs all `backend/migrations/*.sql` in-memory for millisecond invariant testing.
  - `d1` (`worker::D1Database`, `wasm32`) — production/Wrangler D1 backend preserving Betabook's single-CTE-reference SQL discipline (`SQLITE_LIMIT_EXPR_DEPTH <= 100`).
- **`backend/worker`**: Single `axum` router inside Cloudflare Workers (fetch and scheduled handlers), handling:
  - Full Rust authentication (`/api/auth/*`, `/api/terms/*`) compatible with existing D1 `user`/`session`/`account`/`verification` tables, scrypt password hashes, and signed session cookies.
  - Public catalog & search APIs, avatar R2/Cache-API serving, and weekly streaming multipart R2 catalog exports.
  - SEO routes (`/robots.txt`, `/sitemap-index.xml`, `/sitemap/:shard`), canonical slug 308 redirects, `ASSETS` HTML `<meta>` / JSON-LD / Vite `modulepreload` / inline `__BETABOOK_DATA__` cold-load bootstrap injection, and zero-JS static HTML routes (`/about`, `/terms`, `/terms/:version`).
- **`frontend/src/spa/`**: Plain Vite + React 19 + HeroUI v3 + Tailwind v4 SPA using route-split React Router chunks, `frontend/src/spa/bootstrap.ts` (`__BETABOOK_DATA__` single-load consumer), and typed HTTP requests to the Worker.

## Local Verification Commands

```bash
# In a mise-activated shell, install the repository toolchain
mise install
pnpm install --frozen-lockfile
mise run rust-check
cargo deny --locked check advisories

# Exercise the deployable Rust Worker and SPA locally
pnpm build
pnpm test:rust-worker
pnpm check
pnpm preview

# Verify packaging without publishing
pnpm exec wrangler deploy --dry-run --config wrangler.jsonc
```

## Compatibility

The Worker uses the existing versioned D1 migrations, R2 object keys, public URLs, session cookies and credential hashes. Native Rust tests apply the SQL to SQLite. The workerd smoke suite runs the release Worker against local D1 and R2, and the browser suite exercises the same build.
