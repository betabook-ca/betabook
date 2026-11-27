---
name: betabook-dev
description: >-
  Run and troubleshoot the local Betabook Rust Worker and Vite SPA with mise,
  automatic rebuilds, React Fast Refresh, local D1/R2, seeded accounts, and auth.
  Use for development setup, runtime checks, and deployment. Test authoring and
  architecture conventions are documented in docs/.
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
mise run dev
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

### Edit and reload

Run `mise run dev` (or `pnpm dev`) from the repository root. Open the Wrangler URL, normally `http://localhost:3000`. This one command serves the Rust API, the SPA and the Worker-rendered public pages. For port 3001, use `mise run dev --port 3001` and set the local `BETTER_AUTH_URL` to `http://localhost:3001` for auth callbacks.

| When editing                              | Local workflow                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust handlers, DB queries or domain logic | Save the source file. Wrangler watches all three crates, including embedded SQL and GraphQL, rebuilds the development WASM, and reloads the open page. A backend-only change skips Vite.              |
| React, CSS or public assets               | The same server rebuilds the SPA and reloads the page. For React Fast Refresh, keep Wrangler on 3000 and run `pnpm dev:spa` in a second terminal. Open Vite on 3001. Its API requests go to Wrangler. |
| A Rust API request or response shape      | Run `pnpm api:generate` and commit the updated OpenAPI document and SPA declarations. Verify with `pnpm api:check`.                                                                                   |
| A D1 migration                            | Apply it with `pnpm db:migrate:local` before exercising the new schema.                                                                                                                               |

For a custom backend port in Fast Refresh mode, point the proxy at that Worker, for example `BETABOOK_DEV_WORKER_ORIGIN=http://127.0.0.1:3001 pnpm dev:spa --port 3002`. Use the Wrangler URL when checking the initial HTML, redirects, asset headers or browser reload on a Rust edit.

Wrangler logs the changed path and mise reports which build ran. Dev outputs live in `target/betabook-dev/`. To verify the optimized artifacts used in CI, run `pnpm build` followed by `BETABOOK_PREBUILT=1 pnpm test:rust-worker`. Use `pnpm preview` for a release preview.

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
See the scope predicates in `backend/db/src/moderation/coverage.sql`. The review queue is at
`/admin/requests`.

## Checks and task references

- Run `pnpm check` before committing and `pnpm build` for the release. Use the [test selection guide](../../../docs/testing/selection.md) when adding or running a focused test.
- Run `mise run rust-check` for native and WASM linting, formatting and native tests. For HTTP and Cloudflare bindings, run `pnpm build` followed by `BETABOOK_PREBUILT=1 pnpm test:rust-worker`. Use `cargo deny --locked check advisories` to check dependency advisories.
- For local gallery review, use the [Storybook guide](../../../docs/frontend/storybook.md). For browser setup, CI suite selection and accessibility checks, use the [Playwright reference](../../../docs/testing/playwright.md).
- For a release, the scheduled catalog export, or Worker secrets, use the [deployment reference](references/deployment.md).

## License file

The app serves `/license.txt`. Keep `frontend/public/license.txt` synchronized with `LICENSE` when updating
the license or required notices.
