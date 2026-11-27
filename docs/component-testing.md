# Choosing and writing tests

Choose the environment from the behavior the test must prove, then choose its
path and filename. Use the least expensive environment that can reproduce the
regression faithfully. A component can need more than one kind of test, with a
different responsibility in each suite.

## Choose the environment

| What must fail if the implementation breaks?                                                                 | Test type                                                     | Example                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A calculation, parser, validator or serializer returns the wrong value                                       | Node unit test, `*.test.ts`                                   | [Date filter calculations](../frontend/src/lib/filters/date-filter.test.ts)                   |
| An action, query or route permits the wrong user, writes incorrect data or leaves partial state              | Native Rust DB test or release Worker HTTP test               | [SQL mutation tests](../backend/db/tests/migrations_and_queries.rs)                           |
| Clicking, typing or changing props produces the wrong state, callback, identity, payload or error            | Mounted React test in jsdom, `*.dom.test.tsx`                 | [Journal form behavior](../frontend/src/components/journal/journal-entry-fields.dom.test.tsx) |
| A hook mishandles debounce, cancellation, stale responses or cleanup                                         | Real hook in jsdom, `*.dom.test.ts` or `*.dom.test.tsx`       | [Search lookup lifecycle](../frontend/src/hooks/use-search-lookup.dom.test.tsx)               |
| A React component produces the wrong static markup                                                           | Node rendering test, `*.test.tsx`                             | [Server-rendered navigation links](../frontend/src/components/nav-link.test.tsx)              |
| Layout, clipping, scrolling, painted focus, native editing, touch or accessibility depends on real rendering | Playwright, `tests/ui/*.spec.ts`                              | [Hashtag caret and layout](../tests/ui/hashtag-filter.spec.ts)                                |
| The app's routing, history, hydration or opening a new tab breaks                                            | Playwright against the local app, `tests/ui/*.spec.ts`        | [Search navigation](../tests/ui/search-integration.spec.ts)                                   |
| A component needs a reproducible appearance or state for review                                              | Colocated `*.stories.tsx`, plus behavioral tests where needed | [Pagination states](../frontend/src/components/ui/load-more-button.stories.tsx)               |

Prefer unit tests and mounted component tests. Add a browser test only when its
assertion needs real rendering or native browser behavior. A click does not by
itself require Playwright. Form submission and React keyboard
handlers usually belong in jsdom. Use a browser when the assertion depends on
native behavior or rendering: segmented date editing, pointer hit testing,
scrolling, focus rings, portal clipping or actual React Router navigation. DOM focus
retention can be tested in jsdom; the painted ring and browser focus interactions
still need Playwright.

For example, a date filter can have three responsibilities: date arithmetic in
`frontend/src/lib/filters/date-filter.test.ts`, preset selection and callbacks in
`frontend/src/components/filters/date-filter.dom.test.tsx`, and calendar/segmented editing in
`tests/ui/send-date-filter.spec.ts`. Each layer should establish something the
others cannot.

## Match the path and suffix

The [Vitest projects](../vitest.config.mts) and [Playwright config](../playwright.config.ts) define collection.

| Path and filename                                                                                    | Runner and rules                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `frontend/src/**/*.test.{ts,tsx}`, excluding DOM tests                                               | Vitest `unit` in Node. Follow the [unit test rules](#unit-test-rules).                |
| `*.dom.test.{ts,tsx}` under `frontend/src/components/`, `frontend/src/hooks/` or `frontend/src/spa/` | Vitest `components` in jsdom. Follow the [jsdom rules](#jsdom-rules).                 |
| `backend/` crate tests and `tests/worker/*.ts`                                                       | Native Rust or release Worker in workerd. Follow the [Workers rules](#workers-rules). |
| `tests/ui/*.spec.ts`                                                                                 | Playwright. Follow the [browser rules](#browser-rules).                               |
| Colocated `*.stories.tsx`                                                                            | Storybook examples. Follow the [story rules](#story-rules).                           |

Keep frontend tests beside production code in the configured directories. For a new location, confirm the focused command collects the test.

The root [AGENTS.md](../AGENTS.md) indexes this guide. Additional instructions
in [components](../frontend/src/components/AGENTS.md) and [tests/ui](../tests/ui/AGENTS.md)
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
- Mock external boundaries such as transport, React Router navigation, an invoked
  HTTP action or a browser API. `RouterLink` is already a plain anchor in
  both projects ([test/setup-router-link.ts](../test/setup-router-link.ts)); mock
  it again only to observe it, spreading `@/test/router-link`. A mocked save callback proves what the form submits. Exercise authorization
  and persistence through the real Worker and database.
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
[the app search adapter](../frontend/stories/fixtures/app-search-demo.tsx) does this.
A presentation demo that reimplements filtering or React state cannot establish
production behavior.

## Unit test rules

- Call the production parser, calculation, validator or renderer in the Node `unit` project. Use `.test.tsx` for JSX or static React markup. Mount the component in jsdom when an assertion depends on state or effects.
- Replace external transport in adapter tests when you need to control an upstream response, failure or retry.

## Workers rules

- Put domain behavior in the corresponding Rust crate. Exercise database authorization, mutations, constraints and triggers through the native SQLite executor with the checked-in migrations. [Database integration tests](../backend/db/tests/migrations_and_queries.rs) show the fixture setup.
- Test Worker HTTP behavior against the release build and actual local Cloudflare bindings. The [smoke harness](../tests/worker/worker.test.ts) applies D1 migrations and supplies an isolated database and R2 bucket. Follow the [Worker test instructions](../tests/worker/AGENTS.md) when adding route scenarios.
- Establish the records, users and permissions each test needs. For denied writes, verify that stored data is unchanged. For privacy reads, prove that an authorized viewer can see the row as well as checking that the unauthorized viewer cannot.
- Preserve the real query, session handling or mutation that the assertion exercises. Stub external services such as email or upstream import providers where needed.

## Browser rules

- Identify the behavior that requires a browser before adding a case. Keep
  payload variations, client validation, retry logic and hook lifecycle in jsdom;
  keep database correctness in Rust integration tests. Cover actual route/history integration
  in the browser only where the integration itself is the subject.
- Import `test`, `expect` and `openStory` from [story.ts](../tests/ui/story.ts).
  This preserves runtime-error and live-story-API checks. Use `openStory` to get
  deterministic dates, theme, render readiness, fonts and finite animations;
  do not replace it with a heading check or fixed timeout.
- Check computed styles, geometry, viewport position or the relevant native
  interaction. Use the existing accessibility helpers for rendered audits.
  Passing tests do not capture screenshots; failure screenshots support debugging.
- Keep visual, responsive and touch-sensitive cases in the full project matrix.
  Two tags narrow it, and each states something the assertions cannot depend on.
  Use `@layout` when no theme can change the measurement: it runs the
  desktop-light/mobile-dark diagonal, so both viewports are still measured. Use
  `@behavior` when neither viewport nor theme can change the result; it runs once
  in desktop-light.
  A test that checks theme-dependent colors or renders differently per theme
  stays untagged. Needing fewer runs is not itself a reason to apply either tag.
- Tag a test `@app` when it loads the real app through `appBaseURL`. The tag
  chooses the server, not the matrix, so it combines with `@layout` or
  `@behavior`. Gallery runs do not start the app, so an untagged app test
  fails there with a refused connection.
- [Accessibility checks](../tests/ui/accessibility.spec.ts) audit six representative
  composed states for contrast and horizontal overflow. This is a bounded list,
  not an exhaustive story sweep. Add a browser audit only for a distinct rendered
  risk or an interaction state those checks do not reach. Use existing jsx-a11y
  lint rules for static labels, alt text, roles and ARIA; use component tests for
  accessible state changes and keyboard handlers.
- When coverage moves to jsdom, delete its obsolete Playwright case. In a mixed
  test, retain browser assertions and the actions needed to reach that state;
  remove duplicate behavioral assertions. Preserve the story. Never weaken an
  assertion to conceal a regression.

## Running browser checks

`pnpm test:ui` builds the gallery and runs the explicitly authored Chromium tests
at desktop and mobile widths in both themes, subject to the tags above. It also
runs real app checks for navigation, branding, theme persistence and
favicon/touch/manifest/social assets. Stories do not automatically create tests.
There is no exhaustive sweep, scheduled or otherwise.

Locally, build the gallery and run the affected browser files. CI's **UI reference**
job runs all explicit browser tests; do not run that full suite locally.

Playwright starts the gallery preview and the app. A new app server applies
local D1 migrations, then `pnpm preview` builds the Worker and serves the build,
not the dev server, so its first start includes a full build. The app defaults to port 3000, matching
`pnpm dev`. Set `BETABOOK_UI_PORT` when using another port, for example
`BETABOOK_UI_PORT=3003`; the server and tests use that same port.
Readiness waits for the homepage, then app setup confirms the anonymous session
endpoint answers signed out before navigation checks, which still make real
session requests.
An existing app can be reused, but stop and migrate it first if its database is out of date.
Use the normal local `.dev.vars` setup; CI copies `.dev.vars.example` and needs
no seed or account for these app checks.

`BETABOOK_UI_SUITE=gallery` runs every test except `@app` and starts only the
gallery preview; `BETABOOK_UI_SUITE=app` runs only `@app` and starts only the
app. The app suite does not need a gallery build. CI keeps one app job and three
parallel gallery shards, with four Playwright workers per gallery shard.

The shared `openStory` readiness includes the preview's render/play completion,
font loading and finite animations. Accessibility scans cover the complete
story document, including open portals, using WCAG 2.0/2.1 A/AA rules. Inspect
browser behavior and computed styles directly; source-text patterns cannot prove
the rendered result.

Email previews retain their scriptless iframe sandbox. Because it blocks axe's
asynchronous callbacks, [the email accessibility helper](../tests/ui/email-accessibility.ts)
audits the actual email HTML in a separate page at the same frame dimensions,
while the gallery audits the iframe element. Both use the full WCAG A/AA rules.
Interactions still exercise the sandboxed preview; a focused test verifies that
document, contrast, image and link rules ran on its content.

The CI **UI reference** job runs on PRs and main-branch pushes and is a deployment
prerequisite. It uploads an HTML report with failure screenshots and traces.
Repository branch protection must require that job to block merges; the workflow
alone does not configure merge rules. The separate
[publishing workflow](../.github/workflows/chromatic.yml) hosts the gallery and
Storybook documentation MCP on Chromatic. Its UI Tests and UI Review stay
disabled, and the preview disables snapshots. Do not capture or attach passing
screenshots for review: there is no automated comparison or routine reviewer.
The QR test retains its in-memory capture because decoding the painted pixels is
the assertion itself.

## Story rules

Stories describe reproducible UI states and make visual review possible. Use the
real imported component, deterministic sample data and local interactions; no
live mutations or database imports. A story is not a substitute for a behavioral
test. New stories do not inherit browser tests. Prefer unit/component coverage
for their production behavior, and reserve browser checks for rendered risks.
Use one CSF file per production component module with its actual imported
`meta.component`, so the Storybook MCP manifest stays usable; closely related
exports can share that file. Put cross-component compositions in
`frontend/stories/patterns/`, design principles and tokens in `frontend/stories/foundations/`,
maintenance views in `frontend/stories/internal/`, and shared story-only fixtures in
`frontend/stories/fixtures/`. Sidebar titles follow Foundations, Components, Patterns and
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
| One component file                                  | `pnpm test:components frontend/src/components/journal/tag-input.dom.test.tsx`            |
| All jsdom tests                                     | `pnpm test:components`                                                                   |
| One frontend unit file                              | `pnpm test --project=unit frontend/src/lib/filters/date-filter.test.ts`                  |
| Rust crate checks                                   | `mise run rust-check`                                                                    |
| Release Worker HTTP suite                           | `pnpm build`, then `pnpm test:rust-worker`                                               |
| Both Vitest projects                                | `pnpm test`                                                                              |
| One browser file after building the current gallery | `pnpm storybook:build`, then `pnpm exec playwright test tests/ui/hashtag-filter.spec.ts` |
| Representative accessibility checks after building  | `pnpm exec playwright test tests/ui/accessibility.spec.ts`                               |
| Full browser suite (CI only; too slow locally)      | `pnpm test:ui`                                                                           |
| All normal checks before committing                 | `pnpm check`                                                                             |

Confirm the focused run collected the intended test. Run the affected suite and
checks in [the repository guide](repository-guide.md#testing-and-validation); `pnpm check` includes both Vitest
projects but does not include Playwright or the Cloudflare build. UI changes also
need their affected browser files; leave the full browser suite to CI. Runtime,
dependency, route or Cloudflare configuration changes also need
`pnpm build`. Documentation-only changes need
formatting and reference checks, without artificial runtime tests.
