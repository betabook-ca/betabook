# Playwright and the gallery

## Browser rules

- Identify the behavior that requires a browser before adding a case. Keep
  payload variations, client validation, retry logic and hook lifecycle in jsdom;
  keep database correctness in Rust integration tests. Cover actual route/history integration
  in the browser only where the integration itself is the subject.
- Import `test`, `expect` and `openStory` from [story.ts](../../tests/ui/story.ts).
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
- [Accessibility checks](../../tests/ui/accessibility.spec.ts) audit six representative
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
asynchronous callbacks, [the email accessibility helper](../../tests/ui/email-accessibility.ts)
audits the actual email HTML in a separate page at the same frame dimensions,
while the gallery audits the iframe element. Both use the full WCAG A/AA rules.
Interactions still exercise the sandboxed preview; a focused test verifies that
document, contrast, image and link rules ran on its content.

The CI **UI reference** job runs on PRs and main-branch pushes and is a deployment
prerequisite. It uploads an HTML report with failure screenshots and traces.
Repository branch protection must require that job to block merges; the workflow
alone does not configure merge rules. The separate
[publishing workflow](../../.github/workflows/chromatic.yml) hosts the gallery and
Storybook documentation MCP on Chromatic. Its UI Tests and UI Review stay
disabled, and the preview disables snapshots. Do not capture or attach passing
screenshots for review: there is no automated comparison or routine reviewer.
The QR test retains its in-memory capture because decoding the painted pixels is
the assertion itself.
