# Browser tests

Use Playwright for actual layout, scrolling, native input, touch, accessibility and app navigation. Import `test`, `expect` and `openStory` from [story.ts](story.ts). Keep callback and state assertions in colocated Vitest tests.

Tag cases loading `appBaseURL` with `@app`. Use `@behavior` for viewport- and theme-independent behavior and `@layout` for measurements independent of theme. Leave theme-sensitive rendering cases in the full matrix.

Run the affected spec files locally. Build the gallery first for gallery tests; the full browser suite runs in CI. Read the [Playwright reference](../../docs/testing/playwright.md) for suite selection, readiness, accessibility scans, and gallery or app setup.
