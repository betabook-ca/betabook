# Browser test selection

Before adding or changing `*.spec.ts`, read [Choosing and writing tests](../../docs/component-testing.md), especially the [browser rules](../../docs/component-testing.md#browser-rules).

- Keep cases that need real rendering, computed styles, geometry, clipping, scrolling, native input, touch, accessibility audits or actual app routing/history.
- Put component state, callback payloads, client validation, retries and hook lifecycle in colocated `*.dom.test.{ts,tsx}` under `components/` or `hooks/`. Put permissions, persistence and pure calculations in Workers `*.test.{ts,tsx}` files. A user interaction alone is not a reason to add a browser test.
- Import `test`, `expect` and `openStory` from `./story`. Use its theme/render readiness; do not add sleeps or weaken assertions to make a test pass.
- Prefer unit/component tests. [accessibility.spec.ts](accessibility.spec.ts) audits a small fixed set of composed states; there is no exhaustive story sweep. Use jsx-a11y lint rules for static accessibility and component tests for accessible state and keyboard handlers. Add browser audits only for a distinct rendered risk.
- Retain the full viewport/theme matrix for rendering, responsive and touch-sensitive assertions. A measurement no theme can change may use `@layout`, which runs the desktop-light/mobile-dark diagonal. Browser behavior independent of both viewport and theme may use `@behavior` to run once in desktop-light. Theme-dependent color assertions stay untagged.
- Tag any test that loads `appBaseURL` with `@app`. It selects the run that starts `next dev`; gallery runs don't, so an untagged app test fails with a refused connection.
- Delete obsolete cases after moving their coverage to jsdom. In mixed tests, remove duplicated behavior checks while retaining browser assertions and required setup.

Build the current gallery with `pnpm storybook:build`, then run only the affected spec files, e.g. `pnpm exec playwright test tests/ui/hashtag-filter.spec.ts`. Set `BETABOOK_UI_SUITE=gallery` when no `@app` test is involved so `next dev` isn't started. Don't run the full suite (`pnpm test:ui`) locally; it is too slow, and CI's **UI reference** job runs it. Do not capture or attach passing screenshots. Keep failure screenshots for debugging; retain image capture only when the image itself is used by an assertion (for example, QR decoding). The app suite needs no gallery build.
