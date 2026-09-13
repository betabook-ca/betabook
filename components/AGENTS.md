# Tests beside components

Before adding or changing a test, read [Choosing and writing tests](../docs/component-testing.md).

- `*.dom.test.tsx` (or `.ts` without JSX) runs in jsdom. Use this for mounted component state, input, callbacks, submitted values, errors, pending requests and lifecycle. Follow the guide's [jsdom rules](../docs/component-testing.md#jsdom-rules).
- Ordinary `*.test.ts` and `*.test.tsx` run in Workers. Use them for pure functions or server-rendered output contracts. `.tsx` alone does not provide a DOM. Follow the [Workers rules](../docs/component-testing.md#workers-rules).
- Geometry, clipping, native browser editing, painted focus, touch and real app navigation belong in `tests/ui/*.spec.ts`. A click or form submission alone does not justify Playwright.
- `*.stories.tsx` supplies review states and inherits gallery checks. It does not replace a test of production behavior. Read the adjacent story before UI changes.
- When adding DOM coverage that replaces a browser case, delete the superseded case or duplicate behavior from a mixed visual test. Keep the browser-specific assertions and the story.

Run a focused DOM file with `pnpm test:components components/journal/tag-input.dom.test.tsx`.
