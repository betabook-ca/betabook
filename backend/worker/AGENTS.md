# Rust Worker

The root Wrangler configuration serves the Rust release Worker and the assets from `dist-spa/`. Axum handles HTTP requests. The scheduled handler streams the public catalog to R2. `pnpm build` uses mise's pinned Rust toolchain and worker-build. Vite prerenders About and the published Terms using the same components as the SPA. CI packages the release once, tests it in workerd, and reuses those artifacts for browser tests and deployment.

Member routes use `require_member_session` in `backend/worker/src/auth/session.rs` to verify the session and current terms acceptance in D1. Admin routes also check the role and enforce area scopes in SQL. Use `resolve_optional_session` only where identity is optional or the user must be able to act before accepting current terms. Keep `/terms`, its archives, `/accept-terms`, contact and account recovery reachable before acceptance.

Register HTTP routes in the Rust router and client routes in `frontend/src/spa/app.tsx`. Entity pages canonicalize slugs, compose metadata at the edge and inline bootstrap data for the client. Share pages check the current owner and token state before rendering metadata. Preserve HTTP status codes, private/no-store headers and generic signed-out metadata on member pages. Keep public landing routes synchronized with sitemap and terms exemptions.

Store user-written Markdown as source. For HTML sent by the Worker, use `render_safe_markdown` in `backend/domain/src/markdown.rs`. For React previews, use `frontend/src/components/ui/markdown.tsx`. Escape raw HTML, turn images into links to avoid third-party requests and permit only absolute HTTP, HTTPS or mailto links.

Keep `wrangler.jsonc`, `.dev.vars.example`, and the checked-in `cloudflare-env.d.ts` aligned when changing bindings or environment variables. Generated `worker-configuration.d.ts` is optional for local validation and must not become a build prerequisite. Zone, DNS, and D1 database resources belong in [`infra/cloudflare`](../../infra/cloudflare/AGENTS.md); Worker settings, bindings, and custom domains stay in `wrangler.jsonc` because every deploy overwrites them.

When changing the HTTP contract, follow the [API generation instructions](src/api_contract/AGENTS.md). For a packaging check, run `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc`.
