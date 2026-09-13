# Browser test selection

Before adding or changing `*.spec.ts`, read [Choosing and writing tests](../../docs/component-testing.md), especially the [browser rules](../../docs/component-testing.md#browser-rules).

- Keep cases that need real rendering, computed styles, geometry, clipping, scrolling, native input, touch, accessibility audits or actual app routing/history.
- Put component state, callback payloads, client validation, retries and hook lifecycle in colocated `*.dom.test.{ts,tsx}` under `components/` or `hooks/`. Put permissions, persistence and pure calculations in Workers `*.test.{ts,tsx}` files. A user interaction alone is not a reason to add a browser test.
- Import `test`, `expect` and `openStory` from `./story`. Use its theme/render readiness; do not add sleeps or weaken assertions to make a test pass.
- Check [design-system.spec.ts](design-system.spec.ts) before adding an accessibility or screenshot case: every built story already receives those checks. Add coverage for a distinct invariant or an interaction state the gallery does not reach.
- Retain the full viewport/theme matrix for rendering, responsive and touch-sensitive assertions. A measurement no theme can change may use `@layout`, which runs the desktop-light/mobile-dark diagonal and still yields one screenshot per theme. Browser behavior independent of both viewport and theme may use `@behavior` to run once in desktop-light. Anything that reads a color stays untagged.
- Tag any test that loads `appBaseURL` with `@app`. It selects the run that starts `next dev`; gallery runs don't, so an untagged app test fails with a refused connection.
- Delete obsolete cases after moving their coverage to jsdom. In mixed tests, remove duplicated behavior checks while retaining browser assertions, required setup and useful screenshots.

Build the current gallery with `pnpm storybook:build`, then focus a file with `pnpm exec playwright test tests/ui/hashtag-filter.spec.ts`. Use `pnpm test:ui` for the full browser suite and review affected screenshots in both themes at mobile and desktop sizes.
