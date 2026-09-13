# Choosing and writing tests

Choose the environment from the behavior the test must prove, then choose its
path and filename. Use the least expensive environment that can reproduce the
regression faithfully. A component can need more than one kind of test, with a
different responsibility in each suite.

## Choose the environment

| What must fail if the implementation breaks?                                                                 | Test type                                                     | Example                                                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A calculation, parser, validator or serializer returns the wrong value                                       | Workers unit test, `*.test.ts`                                | [Date filter calculations](../lib/filters/date-filter.test.ts)                   |
| An action, query or route permits the wrong user, writes incorrect data or leaves partial state              | Workers integration test with migrated D1, `*.test.ts`        | [Journal companion mutations](../actions/journal-companions.test.ts)             |
| Clicking, typing or changing props produces the wrong state, callback, identity, payload or error            | Mounted React test in jsdom, `*.dom.test.tsx`                 | [Journal form behavior](../components/journal/journal-entry-fields.dom.test.tsx) |
| A hook mishandles debounce, cancellation, stale responses or cleanup                                         | Real hook in jsdom, `*.dom.test.ts` or `*.dom.test.tsx`       | [Search lookup lifecycle](../hooks/use-search-lookup.dom.test.tsx)               |
| A server-rendered element has the wrong content or link before hydration                                     | Workers rendering test, `*.test.tsx`                          | [Server-rendered navigation links](../components/nav-link.test.tsx)              |
| Layout, clipping, scrolling, painted focus, native editing, touch or accessibility depends on real rendering | Playwright, `tests/ui/*.spec.ts`                              | [Hashtag caret and layout](../tests/ui/hashtag-filter.spec.ts)                   |
| The app's routing, history, hydration or opening a new tab breaks                                            | Playwright against the local app, `tests/ui/*.spec.ts`        | [Search navigation](../tests/ui/search-integration.spec.ts)                      |
| A component needs a reproducible appearance or state for review                                              | Colocated `*.stories.tsx`, plus behavioral tests where needed | [Pagination states](../components/ui/load-more-button.stories.tsx)               |

A click does not by itself require Playwright. Form submission and React keyboard
handlers usually belong in jsdom. Use a browser when the assertion depends on
native behavior or rendering: segmented date editing, pointer hit testing,
scrolling, focus rings, portal clipping or actual Next.js navigation. DOM focus
retention can be tested in jsdom; the painted ring and browser focus interactions
still need Playwright.

For example, a date filter can have three responsibilities: date arithmetic in
`lib/filters/date-filter.test.ts`, preset selection and callbacks in
`components/filters/date-filter.dom.test.tsx`, and calendar/segmented editing in
`tests/ui/send-date-filter.spec.ts`. Each layer should establish something the
others cannot.

## Match the path and suffix

These rules describe actual collection in
[the component config](../vitest.components.config.mts),
[the Workers config](../vitest.workers.config.mts), and
[the Playwright config](../playwright.config.ts). Match the more specific
`.dom.test` suffix before the general `.test` suffix. `.tsx` enables JSX; it does
not select a runner.

| Path and filename                                                                                                                                                           | Runner and rules                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `components/**/*.dom.test.{ts,tsx}` and `hooks/**/*.dom.test.{ts,tsx}`                                                                                                      | Vitest `components` project; follow [jsdom rules](#jsdom-rules)  |
| `actions/**/*.test.{ts,tsx}`, `app/**/*.test.{ts,tsx}`, `components/**/*.test.{ts,tsx}`, `db/**/*.test.{ts,tsx}`, `lib/**/*.test.{ts,tsx}`, excluding `*.dom.test.{ts,tsx}` | Vitest `workers` project; follow [Workers rules](#workers-rules) |
| `tests/ui/*.spec.ts`                                                                                                                                                        | Playwright; follow [browser rules](#browser-rules)               |
| Colocated `*.stories.tsx`                                                                                                                                                   | Storybook examples; follow [story rules](#story-rules)           |

A `.dom.test.tsx` file under `app/` or `lib/` is not collected by either Vitest
project. An ordinary `.test.ts` under `hooks/` or `test/` is also not collected.
Keep tests beside production code in the configured directories; `test/` holds
shared setup and fixtures. If a new location is necessary, update collection
explicitly and confirm the focused command actually finds the test.

The root [AGENTS.md](../AGENTS.md) indexes this guide. Additional instructions
in [components](../components/AGENTS.md) and [tests/ui](../tests/ui/AGENTS.md)
repeat the relevant path/suffix rules near the
files. These are Markdown instructions; runner configuration controls collection.

## jsdom rules

- Mount the production component with Testing Library `render`, or mount the
  real hook with `renderHook`. Use real React state/effects and real child
  components, including HeroUI. Do not replace the subject with a test or story
  implementation.
- Query by role, accessible name or label. Use `user-event` for user actions and
  await them. Use `fireEvent` only when a specific event cannot be reached through
  `user-event`, and explain the reason. Assert values, identities, callback
  arguments, errors and state changes that matter to a caller or user.
- Mock external boundaries such as transport, Next.js navigation, an invoked
  server action or a browser API. A mocked save callback proves what the form
  submits; test authorization and persistence by calling the real action in the
  Workers suite.
- Exercise pending, rejection, retry, reset and stale-response cases when relevant.
  Check that a rejected save preserves entered data and that repeated interaction
  while pending does not invoke the callback again. For async results, wait for
  the specific usable result; old disabled results may still be mounted.
- Use controlled promises for request races and fake timers for debounce behavior.
  Restore timers after each test, and configure `user-event` to advance fake
  timers when combining them. Await React updates; avoid arbitrary sleeps.
- Reuse [DOM setup](../test/setup-dom.ts) for matchers and cleanup. Its scroll and
  resize shims do not simulate layout. Do not invent dimensions or computed
  styles to claim a layout test passed in jsdom.

Shared story adapters are usable only if they mount the real production
component/controller and replace external boundaries. For example,
[the app search adapter](../stories/fixtures/app-search-demo.tsx) does this.
A presentation demo that reimplements filtering or React state cannot establish
production behavior.

## Workers rules

- Call the real function, action, query or route whose contract is being tested.
  Pure functions use this runner too; they do not need database fixtures.
- For persistence, permissions and SQL behavior, use `createDb(env.DB)` with the
  real migrated D1 supplied by [the test worker](../test/worker.ts) and
  [migration setup](../test/apply-migrations.ts). Keep queries, transactions,
  constraints, triggers and ownership/privacy predicates real.
- Establish each test's preconditions with [fixtures](../test/fixtures.ts) and
  [reset helpers](../test/reset-db.ts) as appropriate. Do not depend on a previous
  test's writes, a developer's seed database or a production bundle.
- Assert the expected record identities and values. For rejected writes, verify
  stored state is unchanged. For privacy, establish that the expected records
  exist and test both permitted and denied viewers, including relevant changes
  to current permissions.
- Replace only external services or request context outside the subject, such as
  email delivery or session acquisition. Do not mock away the authorization,
  query or mutation that the assertion is intended to prove.
- Use `.test.tsx` for a server-rendered output contract that does not need mounted
  client behavior. Rendering HTML alone cannot prove hydration, effects or user
  interaction. Exercise server page loaders directly where practical; jsdom is
  not an environment for mounting an async Next.js Server Component tree.

## Browser rules

- Identify the behavior that requires a browser before adding a case. Keep
  payload variations, client validation, retry logic and hook lifecycle in jsdom;
  keep database correctness in Workers. Cover actual route/history integration
  in the browser only where the integration itself is the subject.
- Import `test`, `expect` and `openStory` from [story.ts](../tests/ui/story.ts).
  This preserves runtime-error and live-story-API checks. Use `openStory` to get
  deterministic dates, theme, render readiness, fonts and finite animations;
  do not replace it with a heading check or fixed timeout.
- Check computed styles, geometry, viewport position or the relevant native
  interaction. Use the existing accessibility helpers for rendered audits.
  Review affected screenshots at mobile and desktop sizes in both themes.
- Keep visual, responsive and touch-sensitive cases in the full project matrix.
  Two tags narrow it, and each states something the assertions cannot depend on.
  Use `@layout` when no theme can change the measurement: it runs the
  desktop-light/mobile-dark diagonal, so both viewports are still measured and
  review still receives one light and one dark screenshot. Use `@behavior` when
  neither viewport nor theme can change the result; it runs once in desktop-light.
  A test that reads a color, compares against a palette token, or renders
  differently per theme stays untagged. Needing fewer runs is not itself a reason
  to apply either tag.
- Tag a test `@app` when it loads the real app through `appBaseURL`. The tag
  chooses the server, not the matrix, so it combines with `@layout` or
  `@behavior`. Gallery runs do not start `next dev`, so an untagged app test
  fails there with a refused connection.
- The [gallery suite](../tests/ui/design-system.spec.ts) already audits and captures
  every built story. Add focused cases for interactions or invariants it does not
  cover, such as an overlay opened by the user or an element's actual geometry.
  Avoid a second test that only repeats the same story's accessibility scan.
- When coverage moves to jsdom, delete its obsolete Playwright case. In a mixed
  test, retain browser assertions and the actions needed to reach that state;
  remove duplicate behavioral assertions. Preserve the story and useful visual
  evidence. Never weaken an assertion to conceal a regression.

## Running browser checks

`pnpm test:ui` builds the current gallery, discovers every story from its index,
and runs Chromium at desktop and mobile widths in both themes. It also runs
real app checks against Next.js for navigation, branding, theme persistence and
favicon/touch/manifest/social assets. Both share the HTML report and project
matrix. The gallery supplies accessibility, horizontal overflow and screenshot
checks; focused cases cover additional rendered and native-interaction contracts.

Playwright starts the gallery preview and the app, applying local D1 migrations
before starting a new app server. The app defaults to port 3000, matching
`pnpm dev`. Set `BETABOOK_UI_PORT` when using another port, for example
`BETABOOK_UI_PORT=3003 pnpm test:ui`; the server and tests use that same port.
Readiness warms the homepage compilation before navigation checks. An existing
app can be reused, but stop and migrate it first if its database is out of date.
Use the normal local `.dev.vars` setup; CI copies `.dev.vars.example` and needs
no seed or account for these app checks.

`BETABOOK_UI_SUITE=gallery` runs every test except `@app` and starts only the
gallery preview; `BETABOOK_UI_SUITE=app` runs only `@app` and starts only the
app. Both still need a gallery build, because the gallery suite collects its
stories from it. CI runs the two suites as separate jobs.

The shared `openStory` readiness includes the preview's render/play completion,
font loading and finite animations. Accessibility scans cover the complete
story document, including open portals, using WCAG 2.0/2.1 A/AA rules. Inspect
browser behavior and computed styles directly; source-text patterns cannot prove
the rendered result.

Email previews retain their scriptless iframe sandbox. Because it blocks axe's
asynchronous callbacks, [the email accessibility helper](../tests/ui/email-accessibility.ts)
audits the actual email HTML in a separate page at the same frame dimensions,
while the gallery audits the iframe element. Both use the full WCAG A/AA rules.
Screenshots and interactions still exercise the sandboxed preview; a focused
test verifies that document, contrast, image and link rules ran on its content.

The CI **UI reference** job runs on PRs and main-branch pushes and is a deployment
prerequisite. It uploads an HTML report with screenshots and failure traces.
Repository branch protection must require that job to block merges; the workflow
alone does not configure merge rules. The separate
[publishing workflow](../.github/workflows/chromatic.yml) hosts the gallery and
Storybook documentation MCP on Chromatic. Its UI Tests and UI Review stay
disabled, and the preview disables snapshots. Playwright screenshots provide
review evidence without automatic pixel comparisons; review them alongside the
geometry, accessibility and interaction results.

## Story rules

Stories describe reproducible UI states and make visual review possible. Use the
real imported component, deterministic sample data and local interactions; no
live mutations or database imports. A story is not a substitute for a behavioral
test. New stories inherit gallery accessibility, overflow and screenshot checks.
Use one CSF file per production component module with its actual imported
`meta.component`, so the Storybook MCP manifest stays usable; closely related
exports can share that file. Put cross-component compositions in
`stories/patterns/`, design principles and tokens in `stories/foundations/`,
maintenance views in `stories/internal/`, and shared story-only fixtures in
`stories/fixtures/`. Sidebar titles follow Foundations, Components, Patterns and
Internal. Gallery reference components are documentation tooling, not production
primitives. Keep class/token helpers in foundation or pattern examples.

Change a shared component and its relevant examples together. Preserve story
titles and export names because published URLs and agent references depend on
them; update affected links and checks for intentional renames. Keep design
guidance in the gallery alongside those examples. The
[design system entry point](design-system.md) only describes how to find them
and does not need an update for routine UI PRs.

## Validate and report

For behavior changes, write a focused test, observe it fail for the intended
behavior, implement the fix and confirm green. For new coverage of existing
behavior, temporarily introduce a targeted production regression, observe the
expected failure, restore production and confirm green. Setup, syntax and import
failures do not count as red. Do not leave deliberate regressions in the diff.
Record the focused commands and meaningful red/green outcomes in the work summary
or PR, rather than adding run logs or migration history to this guide.

| Scope                                               | Command                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| One component file                                  | `pnpm test:components components/journal/tag-input.dom.test.tsx`                         |
| All jsdom tests                                     | `pnpm test:components`                                                                   |
| One Workers file                                    | `pnpm test --project=workers db/queries/journal.privacy.test.ts`                         |
| Both Vitest projects                                | `pnpm test`                                                                              |
| One browser file after building the current gallery | `pnpm storybook:build`, then `pnpm exec playwright test tests/ui/hashtag-filter.spec.ts` |
| Full browser suite, including gallery build         | `pnpm test:ui`                                                                           |
| All normal checks before committing                 | `pnpm check`                                                                             |

Confirm the focused run collected the intended test. Run the affected suite and
checks in [the repository guide](repository-guide.md#testing-and-validation); `pnpm check` includes both Vitest
projects but does not include Playwright or the Cloudflare build. UI changes also
need `pnpm test:ui`. Runtime, dependency, route or Cloudflare configuration changes
also need `pnpm exec opennextjs-cloudflare build`. Documentation-only changes need
formatting and reference checks, without artificial runtime tests.
