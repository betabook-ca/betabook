# Tests beside components

Before adding or changing a test, read [Choosing and writing tests](../docs/component-testing.md).

- `*.dom.test.tsx` (or `.ts` without JSX) runs in jsdom. Use this for mounted component state, input, callbacks, submitted values, errors, pending requests and lifecycle. Follow the guide's [jsdom rules](../docs/component-testing.md#jsdom-rules).
- Ordinary `*.test.ts` and `*.test.tsx` run in Workers. Use them for pure functions or server-rendered output contracts. `.tsx` alone does not provide a DOM. Follow the [Workers rules](../docs/component-testing.md#workers-rules).
- Geometry, clipping, native browser editing, painted focus, touch and real app navigation belong in `tests/ui/*.spec.ts`. A click or form submission alone does not justify Playwright.
- `*.stories.tsx` supplies reproducible examples; it does not automatically create browser tests. It does not replace a test of production behavior. Read the adjacent story before UI changes.
- When adding DOM coverage that replaces a browser case, delete the superseded case or duplicate behavior from a mixed visual test. Keep the browser-specific assertions and the story.

Run a focused DOM file with `pnpm test:components components/journal/tag-input.dom.test.tsx`.

# Overlays

Use the three wrappers below rather than HeroUI's `Drawer`, `Modal` or
`AlertDialog` directly. Which one you want depends on what the overlay
contains, not on the screen size.

- A form, editor or picker is a `ResponsiveDialog` — a bottom sheet on
  phones, a centered column from `md` up. Set the desktop width with `size`,
  not with the app shell's `PAGE_MAX_WIDTH_CLASS`.
- If the form is too tall for 85vh with a keyboard open (roughly ten fields
  or more), add `presentation="fullscreen"`. Put the primary action in
  `footer` when the dialog owns it, so it stays pinned above the keyboard —
  the climb form and the goal form still render their own submit inside the
  form element and scroll with it, and are the remaining conversions.
- A confirmation — delete, reject, a gate — is a `ConfirmDialog`, centered at
  every width. At most one field in `children`; more than that and it's a
  form.
- If an overlay has a fixed height and stacks filters above a scrolling
  list, read `useCompactViewport()` and collapse the filters when it's set.
  The keyboard takes about 340px and only `visualViewport` sees it — Safari
  ignores `interactive-widget`, so a CSS media query won't catch it.

`md` (48rem) is the mobile/desktop line everywhere: the tab bar, the mobile
menu, and dialogs. Prefer `useIsAtLeast` over a new `matchMedia` call. It
always tracks the viewport, so a component that swaps one subtree for another
across the breakpoint has to hold the answer in its own state for the length
of an interaction — ResponsiveDialog shows the shape.

jsdom has no media queries, so component tests see the mobile side unless
they call `stubViewport("desktop")` from `test/viewport.ts`. Geometry belongs
in Playwright, which runs untagged specs at 375 and 1024.
