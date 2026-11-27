# Deployment

`.github/workflows/deploy.yml` runs the checks and a production build on pull requests. Pushes to
`main`, or manual runs on `main`, also apply remote D1 migrations and deploy in the
`betabook-ca/betabook` repository.

A manual deployment mirrors the build–migrate–deploy order:

```bash
pnpm check
pnpm build
pnpm db:migrate:remote
pnpm exec wrangler deploy
```

- The release consists of `dist-spa/`, `backend/worker/build/index.js`, and its WASM module. The root `wrangler.jsonc` configures the production Worker, assets and bindings.
- CI downloads the release that passed workerd tests. `BETABOOK_PREBUILT=1` skips rebuilding when Wrangler consumes those artifacts. Local `pnpm deploy` builds from source. Apply remote migrations before a live deployment.
- Use `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc` for packaging verification.

## Weekly catalog export

A cron (Mondays 06:00 UTC, `triggers.crons` in `wrangler.jsonc`) snapshots the public catalog —
areas and climbs, names, hierarchy, descriptions and grades only — into the `betabook-exports` R2
bucket, where members download it from `/account`. Only the cron writes it; there is no on-demand
trigger. Local servers never fire crons; to exercise it, run `pnpm dev` or `pnpm preview` and
request `/cdn-cgi/handler/scheduled?cron=0+6+*+*+1`.

## Secrets and infrastructure

- CI uses repository secrets `CLOUDFLARE_API_TOKEN` (also needs **Workers R2 Storage: Edit**) and
  `CLOUDFLARE_ACCOUNT_ID`.
- Worker secrets, set with `pnpm exec wrangler secret put <NAME>`: `BETTER_AUTH_SECRET`,
  `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, optional Google OAuth credentials, and optional
  `CLOUDFLARE_USAGE_ACCOUNT_ID` / `CLOUDFLARE_USAGE_API_TOKEN` (Account Analytics Read only) for
  live usage on `/costs`.
- `wrangler.jsonc` configures hosting, D1, R2, rate-limit bindings, the cron schedule and the public
  auth URL. Forks should use their own Cloudflare resources.
- The zone, DNS, managed robots.txt, the `hello@betabook.ca` routing rule, the D1 database itself
  and the `betabook-exports` bucket are managed with OpenTofu in [the Cloudflare stack](../../../../infra/cloudflare/AGENTS.md) and applied by Spacelift. The Worker, its bindings and secrets, and D1 migrations stay
  with wrangler.
