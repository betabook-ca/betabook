# Worker HTTP tests

Run `pnpm build`, then `BETABOOK_PREBUILT=1 pnpm test:rust-worker`. The Node test runner loads the release WASM into workerd and applies the checked-in migrations to a disposable D1 database. Native domain and SQLite tests run with `mise run rust-check`.

Register HTTP scenarios in [worker.test.ts](worker.test.ts) and keep each feature’s assertions in its scenario file. Use `.ts` and explicit extensions for local imports so Node can execute the tests directly. The root `pnpm typecheck` includes the harness, scenarios, and fixture workers.

Use the checked transport for API requests. `apiJson` reads the generated response type after validating the route and status. `postAction` accepts the generated wire arguments. Use `postRawAction` for intentionally malformed action inputs. Keep assertions about records, permissions, and side effects alongside the requests.
