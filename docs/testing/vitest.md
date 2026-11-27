# Frontend unit and component tests

Use the `unit` project for `frontend/src/**/*.test.{ts,tsx}`. The `components` project collects `*.dom.test.{ts,tsx}` under components, hooks and the SPA. Confirm a new location is collected by the [Vitest config](../../vitest.config.mts).

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
  both projects ([tests/vitest/setup-router-link.ts](../../tests/vitest/setup-router-link.ts)); mock
  it again only to observe it, spreading `@/tests/vitest/router-link`. A mocked save callback proves what the form submits. Exercise authorization
  and persistence through the real Worker and database.
- Exercise pending, rejection, retry, reset and stale-response cases when relevant.
  Check that a rejected save preserves entered data and that repeated interaction
  while pending does not invoke the callback again. For async results, wait for
  the specific usable result; old disabled results may still be mounted.
- Use controlled promises for request races and fake timers for debounce behavior.
  Restore timers after each test, and configure `user-event` to advance fake
  timers when combining them. Await React updates; avoid arbitrary sleeps.
- Reuse [DOM setup](../../tests/vitest/setup-dom.ts) for matchers and cleanup. Its scroll and
  resize shims do not simulate layout. Do not invent dimensions or computed
  styles to claim a layout test passed in jsdom.

Shared story adapters are usable only if they mount the real production
component/controller and replace external boundaries. For example,
[the app search adapter](../../frontend/stories/fixtures/app-search-demo.tsx) does this.
A presentation demo that reimplements filtering or React state cannot establish
production behavior.

## Unit test rules

- Call the production parser, calculation, validator or renderer in the Node `unit` project. Use `.test.tsx` for JSX or static React markup. Mount the component in jsdom when an assertion depends on state or effects.
- Replace external transport in adapter tests when you need to control an upstream response, failure or retry.

Run a focused component file with `pnpm test:components frontend/src/components/journal/tag-input.dom.test.tsx` or a unit file with `pnpm test --project=unit frontend/src/lib/filters/date-filter.test.ts`. Both projects run with `pnpm test`.
