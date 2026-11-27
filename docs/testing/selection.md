# Choosing a test

Use the least expensive environment that exercises the actual behavior. For a date filter, test the date calculation in Node, the callbacks in jsdom, and native date editing in the browser.

| Behavior                                                                      | Location and runner                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure frontend logic and static React markup                                   | Colocated `frontend/src/**/*.test.{ts,tsx}` in the [Vitest unit project](vitest.md#unit-test-rules).                                                               |
| React component state, callbacks, errors, pending requests and hook lifecycle | `*.dom.test.{ts,tsx}` under components, hooks or the SPA in [Vitest with jsdom](vitest.md#jsdom-rules). Shared setup lives in [tests/vitest](../../tests/vitest/). |
| Domain rules, SQL authorization, migrations and atomic writes                 | Rust crate tests. Use the [database integration tests](../../backend/db/tests/migrations_and_queries.rs) for migrated SQLite fixtures.                             |
| HTTP responses, WASM behavior and Cloudflare bindings                         | [Worker scenarios](../../tests/worker/AGENTS.md) run against the release build in workerd.                                                                         |
| Layout, native editing, focus, touch, accessibility and app navigation        | [Playwright specs](../../tests/ui/AGENTS.md) in `tests/ui/`.                                                                                                       |
| Reproducible component states for design review                               | Colocated `*.stories.tsx` using the [Storybook guide](../frontend/storybook.md#story-rules).                                                                       |

Exercise the production behavior. Establish the specific records and permissions a test needs, await async work and assert the result a caller or user observes. For denied writes, verify persisted state. For privacy reads, prove the authorized viewer can see the record as well as checking the unauthorized case. When moving a case from Playwright to jsdom, retain the assertions that require a browser.

Confirm the focused command collected the intended test. Use `pnpm test:components <file>` for jsdom, `pnpm test --project=unit <file>` for Node, and `mise run rust-check` for Rust. Run `pnpm build` followed by `BETABOOK_PREBUILT=1 pnpm test:rust-worker` for Worker HTTP behavior. For browser changes, run the affected specs locally and leave the full suite to CI.

See the [root verification rules](../../AGENTS.md#verification) before committing. `pnpm deadcode:prod` separately checks exports reachable only from development or test entrypoints.
