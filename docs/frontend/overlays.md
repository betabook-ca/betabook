# Overlays

Use the wrappers below rather than HeroUI's `Drawer`, `Modal` or
`AlertDialog` directly. Which one you want depends on what the overlay
contains, not on the screen size.

- A form, editor or picker is a `ResponsiveDialog` — a bottom sheet on
  phones, a centered column from `md` up. Set the desktop width with `size`,
  not with the app shell's `PAGE_MAX_WIDTH_CLASS`.
- If the form is too tall for 85vh with a keyboard open (roughly ten fields
  or more), add `presentation="fullscreen"`. Put the primary action in
  `footer` when the dialog owns it, so it stays pinned above the keyboard —
  the climb form and the goal form still render their own submit inside the
  form element and scroll with it, and are the remaining conversions. Lay the
  footer out with `DialogActions`: Cancel, then the primary action, at the end.
- A change that waits for admin review uses `useReviewRequest` and swaps the
  form for `ReviewQueuedNotice` once it's queued.
- A confirmation — delete, reject, a gate — is a `ConfirmDialog`, centered at
  every width. At most one field in `children`; more than that and it's a
  form.
- A readout with no task in it — a playing video, the climbs behind a chart
  mark — may use HeroUI's `Modal` directly, centered at every width.
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
they call `stubViewport("desktop")` from `tests/vitest/viewport.ts`. Geometry belongs
in Playwright, which runs untagged specs at 375 and 1024.
