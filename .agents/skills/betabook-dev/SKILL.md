---
name: betabook-dev
description: >-
  Set up, run, seed, test, and deploy Betabook locally: Node/pnpm setup, .dev.vars and auth
  configuration, local D1 migrations, seeded test accounts and social/trip/video fixtures, admin
  moderation access, worktree bootstrap, the pnpm check/test/UI-test commands and how CI runs them,
  Chromatic, manual deployment, the weekly R2 export cron, and secrets. Use when starting the dev
  server, preparing local data, choosing a seeded account to reproduce something, running or
  debugging checks, or deploying. Not for writing tests (docs/component-testing.md) or architecture
  rules (docs/repository-guide.md).
---

# Betabook development

`package.json` and the config files are the source of truth for scripts and tooling; this skill
explains how they fit together.

## Local setup

Activate mise in your shell and run `mise install` from the checkout. The app and CI share
the versions in `mise.toml`; mise reads Rust’s pin, targets, and components from
`rust-toolchain.toml`. The local scripts use Node’s TypeScript support and `node:sqlite`.

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open http://localhost:3000 and sign in with **`dev@example.com` / `password`**.

`pnpm setup` copies `.dev.vars.example` if `.dev.vars` is missing, migrates a new local database,
and runs the seed script. It preserves an existing environment file and existing climbs, but resets
the default development account's name and password on every run.

**For an existing checkout, apply new migrations explicitly** — setup skips migration when a local
database already exists:

```bash
pnpm db:migrate:local
```

Stop the dev server before running local database scripts and restart it afterwards so it sees the
updated data. Local D1 state lives under `.wrangler/state/` and is separate from production.

### Worktrees

Once Husky hooks are installed, `.husky/post-checkout` runs dependency installation and setup for a
new worktree. It skips ordinary branch switches and environments with `CI` or
`BETABOOK_SKIP_BOOTSTRAP` set. If bootstrap fails, run the setup commands above in that worktree.

### Environment and authentication

`pnpm dev` builds the Vite SPA and Rust WASM bundle, then serves both with local Wrangler bindings. `.dev.vars.example` documents the local overrides for `wrangler.jsonc`:

- `BETTER_AUTH_URL` must match the local server URL, including its port. Without the override, auth
  links use the production URL.
- `BETTER_AUTH_SECRET` signs sessions; the example value is for local development.
- Leave `RESEND_API_KEY` empty to print emails (verification/reset links, friend requests) in the
  dev server console when `BETTER_AUTH_URL` uses `localhost`, `127.0.0.1`, or `[::1]`. Other origins
  require an email key and never log message contents as a fallback. Email/password sign-up
  requires verification; seeded accounts are already verified.
- Google sign-in is enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
  The example file lists callback URLs.
- Email sign-in, sign-up and password reset require a Turnstile token only when both
  `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set. The example file lists Cloudflare's test
  keys.

`cloudflare-env.d.ts` is the checked-in application binding contract; keep it aligned with binding
and environment changes. `pnpm cf-typegen` generates the full Workers types for inspection; builds
and tests do not depend on that gitignored output.

## Sample data

`pnpm seed` creates 400 areas, 5,000 climbs and 50 synthetic climbers (`climber1@example.com`
onward, password `password`) with sends and journal history. Before picking an account to reproduce
a social, visibility, trip, video, Terms of Service, or tour scenario, read
[references/seed-data.md](references/seed-data.md) — it lists what each seeded account demonstrates
and the seed flags.

**`pnpm seed --force` clears local areas, climbs, sends, journal entries, trips, and synthetic
climbers before reseeding**, including the development account's logs and trips.

### Moderation

```bash
pnpm promote-admin dev@example.com
```

The role alone grants no area access. Admins also need rows in `admin_area_scopes`, each covering an
area and its descendants. There is no assignment UI; insert grants directly into the local database.
See `drizzle/schema/moderation.ts` and `lib/moderation.ts`. The review queue is at
`/admin/requests`.

## Checks

Run `mise run rust-check` for native and WASM linting, formatting, and native tests. The
[Rust migration guide](../../../docs/rust-migration.md#local-verification-commands) lists the release
Worker smoke test and dependency advisory commands.

```bash
pnpm check                                # lint, formatting, dead code, types, tests
pnpm test -- lib/journal.test.ts           # focused test run
pnpm build                                 # production Workers build used by CI
```

| Command                             | Purpose                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`       | Type-aware Oxlint checks / automatic fixes                                    |
| `pnpm format` / `pnpm format:check` | Oxfmt formatting / verification                                               |
| `pnpm deadcode`                     | Knip unused code and dependency checks                                        |
| `pnpm deadcode:prod`                | Extra audit excluding test and development entrypoints; separate from `check` |
| `pnpm typecheck`                    | TypeScript checks for the SPA, tools and reference suite                      |
| `pnpm test`                         | Full Vitest suite (components + workers projects)                             |
| `pnpm test:components`              | React component and hook tests in jsdom                                       |
| `pnpm db:generate`                  | Generate migrations from `drizzle/schema/`                                    |
| `pnpm db:migrate:local`             | Apply migrations to local D1                                                  |
| `pnpm preview`                      | Build and preview the Cloudflare Workers bundle locally                       |

The pre-commit hook formats staged files; the pre-push hook runs `pnpm check`.

### Vitest projects

Tests are colocated with the code. `pnpm test` runs both projects, so `pnpm check` and CI include
both:

- **components:** `components/**/*.dom.test.{ts,tsx}` and `hooks/**/*.dom.test.{ts,tsx}` in jsdom
  with React Testing Library. No Storybook, Next.js, browser, or D1. Run one file with
  `pnpm test:components components/journal/tag-input.dom.test.tsx`.
- **workers:** the remaining colocated tests, in the Cloudflare Workers pool with real D1 migrations
  through `test/apply-migrations.ts` and entrypoint `test/worker.ts`. No seeded data or production
  build needed. Run with `pnpm test --project=workers`.

See `docs/component-testing.md` for choosing and writing tests.

### Seed checks

Against a disposable copy of a migrated, default-seeded SQLite database:

```bash
pnpm test:seed-social /path/to/copy.sqlite
pnpm test:seed-trips /path/to/copy.sqlite
```

CI's **Test & Build** job runs both against a freshly migrated and seeded database.

### Storybook and browser tests

For UI work, read `docs/design-system.md` and `tests/ui/AGENTS.md`. `pnpm storybook` runs the
internal component gallery with real components and local fonts; it needs no running app or seeded
database.

`pnpm test:ui` runs the gallery and real-app branding checks in light/dark themes at desktop/mobile
sizes. **It is too slow to run locally — CI runs it.** Locally:

1. Install Chromium once: `pnpm exec playwright install chromium`.
2. Use a dedicated preview port for browser checks so the suite exercises the current release build.
3. `pnpm storybook:build`, then only the spec files you changed:
   `pnpm exec playwright test <file>`. Add `--project=mobile-dark` to run one project.

The suite starts a gallery preview on port 6007 and builds and previews the app on port 3000
(`pnpm preview`), or reuses a server already there; set `BETABOOK_UI_PORT=3003` for another port. It
applies local migrations before starting a new app server; branding checks need no seed or
signed-in account. A local run uses half the machine's cores (all four projects in one process) and
skips trace recording; re-run a failing case with `--trace on` to get one. Passing screenshots are
not collected; failure screenshots remain for debugging.

Project tags: `@behavior` checks run only in `desktop-light`; `@layout` checks run the
`desktop-light`/`mobile-dark` diagonal; theme-sensitive checks run all four projects.

In CI (the organization shares 20 concurrent jobs, so runners are packed rather than added):

- One job runs the `@app` tests with two Playwright workers against `pnpm preview`. More workers
  starved the server on a four-core runner.
- Three gallery shards run the rendering/native-browser tests and a small accessibility set, four
  workers each, no app server. Only these shards build Storybook. There is no exhaustive story
  sweep.
- **UI reference** requires all four jobs; each uploads a `ui-reference-report-<suite>-<shard>`
  artifact.

### Chromatic

`.github/workflows/chromatic.yml` publishes upstream branch Storybooks using the
`CHROMATIC_PROJECT_TOKEN` secret. It only publishes the gallery: **UI Tests and UI Review must both
stay disabled** in Chromatic's Manage settings to avoid billed snapshots, and the shared Storybook
preview sets `chromatic.disableSnapshot: true`. There are no baselines or approvals to maintain.
PRs require **Test & Build** and **UI reference**; publishing is advisory and fork PRs need no
Chromatic secret.

Connect the hosted Storybook MCP server with `codex mcp login betabook-storybook` or Claude Code's
`/mcp`. Each collaborator authenticates individually; the CI token is not an MCP login.

## Deployment

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

- The release consists of `dist-spa/`, `crates/betabook-worker/build/index.js`, and its WASM module. The root `wrangler.jsonc` configures the production Worker, assets and bindings.
- CI downloads the release that passed workerd tests. `BETABOOK_PREBUILT=1` skips rebuilding when Wrangler consumes those artifacts. Local `pnpm deploy` builds from source. Apply remote migrations before a live deployment.
- Use `pnpm exec wrangler deploy --dry-run --config wrangler.jsonc` for packaging verification.

### Weekly catalog export

A cron (Mondays 06:00 UTC, `triggers.crons` in `wrangler.jsonc`) snapshots the public catalog —
areas and climbs, names, hierarchy, descriptions and grades only — into the `betabook-exports` R2
bucket, where members download it from `/account`. Only the cron writes it; there is no on-demand
trigger. Local servers never fire crons; to exercise it, run `pnpm dev` or `pnpm preview` and
request `/cdn-cgi/handler/scheduled?cron=0+6+*+*+1`.

### Secrets and infrastructure

- CI uses repository secrets `CLOUDFLARE_API_TOKEN` (also needs **Workers R2 Storage: Edit**) and
  `CLOUDFLARE_ACCOUNT_ID`.
- Worker secrets, set with `pnpm exec wrangler secret put <NAME>`: `BETTER_AUTH_SECRET`,
  `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, optional Google OAuth credentials, and optional
  `CLOUDFLARE_USAGE_ACCOUNT_ID` / `CLOUDFLARE_USAGE_API_TOKEN` (Account Analytics Read only) for
  live usage on `/costs`.
- `wrangler.jsonc` configures hosting, D1, R2, rate-limit bindings, the cron schedule and the public
  auth URL. Forks should use their own Cloudflare resources.
- The zone, DNS, managed robots.txt, the `hello@betabook.ca` routing rule, the D1 database itself
  and the `betabook-exports` bucket are managed with OpenTofu in `infra/cloudflare` (see its
  README) and applied by Spacelift. The Worker, its bindings and secrets, and D1 migrations stay
  with wrangler.

## License file

The app serves `/license.txt`. Keep `public/license.txt` synchronized with `LICENSE` when updating
the license or required notices.
