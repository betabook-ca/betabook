# Tests beside components

Before adding or changing a test, read [Choosing and writing tests](../docs/component-testing.md).

- `*.dom.test.tsx` (or `.ts` without JSX) runs in jsdom. Use this for mounted component state, input, callbacks, submitted values, errors, pending requests and lifecycle. Follow the guide's [jsdom rules](../docs/component-testing.md#jsdom-rules).
- Ordinary `*.test.ts` and `*.test.tsx` run in Workers. Use them for pure functions or server-rendered output contracts. `.tsx` alone does not provide a DOM. Follow the [Workers rules](../docs/component-testing.md#workers-rules).
- Geometry, clipping, native browser editing, painted focus, touch and real app navigation belong in `tests/ui/*.spec.ts`. A click or form submission alone does not justify Playwright.
- `*.stories.tsx` supplies reproducible examples; it does not automatically create browser tests. It does not replace a test of production behavior. Read the adjacent story before UI changes.
- When adding DOM coverage that replaces a browser case, delete the superseded case or duplicate behavior from a mixed visual test. Keep the browser-specific assertions and the story.

Run a focused DOM file with `pnpm test:components components/journal/tag-input.dom.test.tsx`.

# Overlays

Content picks the shape; the breakpoint picks the variant. Do not reach for
HeroUI's `Drawer`, `Modal` or `AlertDialog` directly — the three wrappers
below are the whole vocabulary.

- A **task** — a form, an editor, a picker — is a `ResponsiveDialog`: a
  bottom sheet on a phone, a centered column from `md` up. `size` sets the
  desktop width; never the app shell's `PAGE_MAX_WIDTH_CLASS`.
- A task **too tall for 85vh with a keyboard up** (roughly ten fields or
  more) passes `presentation="fullscreen"` and puts its primary action in
  `footer`, which is pinned rather than scrolled to.
- A **question** — delete, reject, a gate — is a `ConfirmDialog`, centered at
  every width. One field in `children` at most; past that it is a task.
- Anything stacking filters above a scrolling list inside a fixed-height
  overlay reads `useCompactViewport()` and collapses its own chrome. The
  keyboard takes about 340px, and only `visualViewport` reports it — Safari
  ignores `interactive-widget`, so a CSS media query will miss it.

`md` (48rem) is the app's mobile/desktop line everywhere: the tab bar, the
mobile menu and every dialog. Use `useIsAtLeast` rather than a new
`matchMedia` call, and `live: false` when crossing the breakpoint would
unmount something the viewer has typed into.

jsdom has no media queries, so a component test reads the mobile side unless
it calls `stubViewport("desktop")` from `test/viewport.ts`. Geometry stays in
Playwright, which runs untagged specs at 375 and 1024.
