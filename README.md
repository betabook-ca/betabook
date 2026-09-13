# Betabook

[Betabook](https://betabook.ca) is a climbing logbook and community crag database for bouldering, sport, and trad climbing.

- Search climbs and explore the area hierarchy, with community ratings and suggested grades.
- Log ascents, repeats, climb sessions, and training in a journal with notes and tags.
- Track open projects and view send history, grade progression, and activity analytics.
- Import sends directly from a public Sendage or KAYA profile, or a CSV, export sends as CSV, and control profile and journal visibility separately.
- Contribute areas, climbs, and descriptions; structural changes go through moderation by admins assigned to the affected areas.
- Learn the logging workflow through an interactive Journal tutorial.

Built with Next.js 16 App Router, React 19, TypeScript, HeroUI, and Tailwind CSS. OpenNext runs the app on Cloudflare Workers; Cloudflare D1 stores data through Drizzle ORM. Better Auth handles email/password and optional Google sign-in, and Resend delivers email.

## Local development

Use **Node.js 24** (also used in CI) and the pnpm version pinned in [`package.json`](package.json). The local scripts use Node's TypeScript support and `node:sqlite`.

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Sign in with **`dev@example.com` / `password`** to try the journal, imports, and account settings.

`pnpm setup` copies `.dev.vars.example` if `.dev.vars` is missing, migrates a new local database, and runs the seed script. It preserves an existing environment file and existing climbs, but resets the default development account's name and password on every run.

**For an existing checkout, apply new migrations explicitly:** setup skips the migration step when a local database already exists.

```bash
pnpm db:migrate:local
```

Stop the dev server before running local database scripts and restart it afterwards so it sees the updated data. Local D1 state lives under `.wrangler/state/` and is separate from production.

### Environment and authentication

[`next.config.ts`](next.config.ts) initializes local Cloudflare bindings for `next dev`. [`.dev.vars.example`](.dev.vars.example) documents the local overrides for [`wrangler.jsonc`](wrangler.jsonc):

- `BETTER_AUTH_URL` must match the local server URL, including its port. Without the override, auth links use the production URL.
- `BETTER_AUTH_SECRET` signs sessions; the example value is for local development.
- Leave `RESEND_API_KEY` empty to print emails, including verification/reset links and friend requests, in the dev server console. Email/password sign-up requires verification; seeded accounts are already verified.
- Google sign-in is enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. The example file lists callback URLs.
- Email sign-in, sign-up and password reset require a Turnstile token only when both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set. The example file lists Cloudflare's test keys.

[`cloudflare-env.d.ts`](cloudflare-env.d.ts) is the checked-in application binding contract. Keep it aligned with binding and environment changes. `pnpm cf-typegen` generates the full Workers types for inspection; builds and tests do not depend on that gitignored output.

### Sample data

`pnpm seed` creates 400 areas, 5,000 climbs, and 50 synthetic climbers by default, plus sends and journal history covering ascents, repeats, projects, and training. Synthetic accounts start at `climber1@example.com` and use `password` unless a different password is supplied when generating them.

The development account and all but the highest-numbered synthetic climber have
accepted the current Terms of Service. With the default seed, use
`climber50@example.com` to test the agreement flow. Every `pnpm seed` run, including
`pnpm seed --social`, refreshes acceptance for existing seeded accounts and resets
that climber's acceptance and history. Other accounts are left alone.

Social seeding assigns a repeatable mix of profile, send commentary, and journal audiences. The first four accounts demonstrate independent sharing and the private-profile override:

| Account                | Profile | Send commentary          | Journal entries          |
| ---------------------- | ------- | ------------------------ | ------------------------ |
| `climber1@example.com` | Members | Members                  | Members                  |
| `climber2@example.com` | Members | Only me                  | Members                  |
| `climber3@example.com` | Members | Members                  | Only me                  |
| `climber4@example.com` | Private | Only me (saved: Members) | Only me (saved: Members) |

Each account has journal history to exercise visibility as its owner, another climber, or a signed-out visitor. Projects remain owner-only for every account. Seeding preserves the development account's privacy preferences.

```bash
pnpm seed --email me@example.com --password local-password --name "Local Climber"
pnpm seed --areas 50 --climbs 500 --users 3 --seed 7 --force
pnpm seed --social                       # add feed scenarios to an existing local seed
```

Fresh seeds include mutual friends, incoming/outgoing friend requests, and all
nine combinations of the three commentary and journal audiences. `pnpm seed --social` refreshes these scenarios without
regenerating climbs or removing the development account's logs or privacy settings.
It resets relationships and journal tour progress for synthetic accounts, while
preserving connections between other accounts and dev's tour progress. Repeating
it does not duplicate activity.

| Account                                         | Social scenario                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `dev@example.com`                               | Seven friends, one outgoing request, and two incoming requests                                                           |
| `climber1@example.com`                          | Friend of dev with member commentary and journal                                                                         |
| `climber2@example.com`                          | Friend with a member-shared journal and private send commentary                                                          |
| `climber3@example.com`                          | Friend with member-shared send commentary and an Only me journal                                                         |
| `climber4@example.com`                          | Friend with a private profile; hidden from discovery and feeds, name only in Friends                                     |
| `climber5@example.com`                          | No relationships in either direction, for the empty-feed flow                                                            |
| `climber6@example.com`, `climber7@example.com`  | Friends journals with Members commentary for climber 6 and Only me commentary for climber 7; opposite request directions |
| `climber8@example.com`                          | Dev's outgoing request; Friends journal inaccessible until accepted                                                      |
| `climber9@example.com`, `climber11@example.com` | Incoming requests from a private and a member-visible profile respectively                                               |
| `climber10@example.com`                         | No connection to dev; Friends journal inaccessible                                                                       |
| `climber12@example.com`                         | Friend of dev with Friends-only commentary and an Only me journal                                                        |
| `climber13@example.com`                         | Completed tour version 1; gets four What's new lessons                                                                   |
| `climber14@example.com`                         | Dismissed tour version 1; gets four What's new lessons                                                                   |
| `climber15@example.com`                         | Completed tour version 2; no invitation, full replay in Account                                                          |
| `climber16@example.com`                         | No tour progress; gets the full nine-lesson tour                                                                         |

Use the seeded password (`password` by default). The full set requires at least
16 synthetic users. Eight authors have a mixed-activity day on September 1, 2026;
very small climb datasets may lack room for that extra day. Dev's feed includes
only accepted friends whose profiles are visible to members. Select **Friends** in Account
when testing shared access to the development account's journal. Friend requests
can be managed independently of the journal audience.

To check request badges, open **Friends → Requests** as dev. The Friends and
Requests tabs should each show **2**, excluding dev's outgoing request. Accepting
one incoming request and declining the other should change both badges to **1**,
then hide them. The mobile menu dot should also disappear. `climber5@example.com`
has no badge. Counts load after the page renders and refresh immediately after
handling a request. Navigation and returning to the app check at most once per
minute; an idle tab does not poll. Run `pnpm seed --social` to restore
these scenarios after testing.

To check request emails locally, leave `RESEND_API_KEY` empty and send a new
request from dev to `climber5@example.com`. The server console should show one
email for that account, naming Dev User and linking to `/friends?view=requests`.
Reloading should keep the request without another email. Cancel it afterward to
restore the empty-feed fixture. The seed script writes directly to the database
and never sends email; the product tour's sample controls also send nothing.

Area and route names, hierarchy, area/route descriptions, route grades, disciplines, community ratings, and ascent counts are public.
Signed-out climb pages list the latest 10 sends anonymously with month-only dates, naming only climbers who share send commentary with **Everyone**.
Activity, profiles, journals, and all other sends require login and retain their audience restrictions.

New accounts default to **Members** send commentary and **Friends** journal entries.
Existing audience choices stay unchanged; the Members label uses the stored `public` value.
Send commentary has its own audience, applied to original-send notes on climb
pages, Sends, the feed, and mirrored ascent notes in the journal. The journal
audience controls access to the journal, sessions, repeats, training, and tags.
Deleting a send retains its journal entry and keeps its commentary audience, including
after further edits. Database triggers classify original-send notes for every write path.
Private profile overrides both audiences and turns the climber's sends into anonymous rows on climb pages;
the disabled selectors show Only me while retaining the saved choices.

To check social seeding against a disposable copy of a migrated, default-seeded
SQLite database, run `pnpm test:seed-social /path/to/copy.sqlite`.

The account is upserted on every run, preserving its ID. Sample data is generated only when there are no climbs or when `--force` is passed. **`--force` clears local areas, climbs, sends, journal entries, and synthetic climbers before reseeding**, including logs on the development account. A fixed seed and size reproduce the same sample history.

To exercise moderation, grant the local admin role:

```bash
pnpm promote-admin dev@example.com
```

The role alone grants no area access. Admins also need rows in `admin_area_scopes`, each covering an area and its descendants. There is no assignment UI; grants are inserted directly into the local database. See the [moderation schema](drizzle/schema/moderation.ts) and [scope checks](lib/moderation.ts). The review queue is at `/admin/requests`.

### Worktrees

Once Husky hooks are installed, [`.husky/post-checkout`](.husky/post-checkout) runs dependency installation and setup for a new worktree. It skips ordinary branch switches and environments with `CI` or `BETABOOK_SKIP_BOOTSTRAP` set. If bootstrap fails, run the local development commands above in that worktree.

## Development checks

For UI work, read [the design system guide](docs/design-system.md).
Run `pnpm storybook` for the internal component gallery, and `pnpm test:ui` for
gallery and real app branding checks in light/dark themes at desktop/mobile sizes.
The UI suite starts a gallery preview on port 6007 and starts or reuses the app
on port 3000, matching `pnpm dev`. If your app uses another port, run
`BETABOOK_UI_PORT=3003 pnpm test:ui` with that port. The suite waits for the
homepage to compile before testing navigation. It applies local migrations before starting a new app server;
no seed or signed-in account is needed for the branding checks. Install
Chromium once with `pnpm exec playwright install chromium`. Storybook uses real
components and local fonts without requiring a running app or seeded database.

Chromatic hosts upstream branch Storybooks using the GitHub Actions secret
`CHROMATIC_PROJECT_TOKEN`. Its workflow only publishes the gallery: **UI Tests
and UI Review must both stay disabled** in Chromatic's Manage settings, which
[avoids billed snapshots](https://www.chromatic.com/docs/faq/disable-ui-tests-and-or-review/).
The shared Storybook preview also sets `chromatic.disableSnapshot: true` to prevent
captures. There are no Chromatic visual baselines or review approvals to maintain.
Require **Test & Build** and **UI reference** for PRs; publishing is advisory and
fork PRs need no Chromatic secret.
Every workflow in the organization shares 20 concurrent jobs, so CI packs each
runner instead of adding runners. One job runs the `@app` tests with two
Playwright workers: on a four-core runner, more starve `next dev` until the app
checks miss their navigation timeouts. Three gallery shards run everything else
with four workers and no app server. **UI reference** requires all four jobs to
pass; each uploads its own `ui-reference-report-<suite>-<shard>` artifact. To run
one project locally, use `pnpm test:ui --project=mobile-dark`.

A local run takes half the machine's cores instead, because it runs all four
projects in one process. It also skips trace recording, which otherwise writes a
trace for every passing test; re-run a failing case with `--trace on` to get one.

Component state and callback checks run with `pnpm test:components` using jsdom
and React Testing Library. They do not build Storybook or start Next.js, a browser,
or D1. Playwright retains rendering, responsive layout, focus/scrolling, touch,
calendar editing, accessibility and real navigation coverage. Browser checks
tagged `@behavior` run only in `desktop-light` because their behavior is independent
of viewport and theme. Checks tagged `@layout` measure geometry no theme can
change, so they run the `desktop-light`/`mobile-dark` diagonal and still produce a
screenshot in each theme. Visual and theme-sensitive checks keep all four projects.

Story tests use shared theme/render readiness and a
fixed date; live story API requests and unhandled browser errors fail the suite.
Focused browser checks assert rendering and native interactions; DOM tests own
component state and submitted form values.
Viewport-independent artifact checks run once in desktop-light; visual,
responsive and touch-sensitive coverage keeps all four projects.

The workflow lives in [`.github/workflows/chromatic.yml`](.github/workflows/chromatic.yml).
After the first main-branch publish, connect the hosted project MCP server with
`codex mcp login betabook-storybook` or Claude Code's `/mcp`. Each collaborator
authenticates individually; the CI token is not an MCP login.

```bash
pnpm check                                # lint, formatting, dead code, types, tests
pnpm test -- lib/journal.test.ts           # focused test run
pnpm exec opennextjs-cloudflare build      # production Workers build used by CI
```

Tests are colocated with the code. `pnpm test` runs both Vitest projects, so
`pnpm check` and CI include both:

- **components:** `components/**/*.dom.test.{ts,tsx}` and `hooks/**/*.dom.test.{ts,tsx}`
  mount real React components/hooks in jsdom. Use Testing Library's accessible
  queries and `user-event`, await pending state changes, and replace only external
  boundaries such as transport or Next.js navigation. Do not mock React hooks or
  replace the component being tested. jsdom does not verify rendered geometry;
  the setup's scroll and resize stubs are deliberately nonvisual.
- **workers:** the remaining colocated tests run in the Cloudflare Workers pool
  with real D1 migrations through [`test/apply-migrations.ts`](test/apply-migrations.ts).
  Its entrypoint is [`test/worker.ts`](test/worker.ts), so tests need neither seeded
  local data nor a production build. DOM tests are explicitly excluded.

Run one DOM file with `pnpm test:components components/journal/tag-input.dom.test.tsx`,
or just the Workers project with `pnpm test --project=workers`. See
[Choosing and writing tests](docs/component-testing.md) for test selection,
path/suffix rules, examples and validation commands.

| Command                             | Purpose                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`       | Type-aware Oxlint checks / automatic fixes                                    |
| `pnpm format` / `pnpm format:check` | Oxfmt formatting / verification                                               |
| `pnpm deadcode`                     | Knip unused code and dependency checks                                        |
| `pnpm deadcode:prod`                | Extra audit excluding test and development entrypoints; separate from `check` |
| `pnpm typecheck`                    | Next route type generation and TypeScript checking                            |
| `pnpm test`                         | Full Vitest suite                                                             |
| `pnpm test:components`              | React component and hook tests in jsdom                                       |
| `pnpm db:generate`                  | Generate migrations from `drizzle/schema/`                                    |
| `pnpm db:migrate:local`             | Apply migrations to local D1                                                  |
| `pnpm preview`                      | Build and preview the Cloudflare Workers bundle locally                       |

The pre-commit hook formats staged files; the pre-push hook runs `pnpm check`. See [the repository guide](docs/repository-guide.md) for architecture, data invariants, and the required red–green test workflow. [AGENTS.md](AGENTS.md) indexes the agent guides. Tutorial implementation guidance lives in [docs/product-tours.md](docs/product-tours.md).

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the checks and a Cloudflare production build on pull requests. Pushes to `main`, or manual workflow runs on `main`, also apply remote D1 migrations and deploy in the `betabook-ca/betabook` repository.

For a manual deployment, mirror the build–migrate–deploy order:

```bash
pnpm check
pnpm exec opennextjs-cloudflare build
pnpm db:migrate:remote
pnpm exec opennextjs-cloudflare deploy
```

`pnpm deploy` is a build-and-deploy shortcut; it does **not** apply migrations. Migrations must stay compatible with the currently deployed worker because the schema changes before the new worker is live.

CI deployment uses the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Runtime credentials (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and optional Google OAuth credentials) are Worker secrets configured with `pnpm exec wrangler secret put <NAME>`. Hosting, D1, rate-limit bindings, and the public auth URL are configured in [`wrangler.jsonc`](wrangler.jsonc); use your own Cloudflare resources when hosting a fork.

The zone, DNS records, managed robots.txt, the `hello@betabook.ca` routing rule, and the D1 database itself are managed with OpenTofu in [`infra/cloudflare`](infra/cloudflare/README.md) and applied by Spacelift. The Worker, its bindings and secrets, and D1 migrations stay with wrangler.

## License

Betabook is source available under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Use is permitted for the purposes defined in that license; commercial use outside
those permissions requires a separate license from the copyright holder.

The app serves a copy at `/license.txt`. Keep `public/license.txt` synchronized with
`LICENSE` when updating the license or required notices.
