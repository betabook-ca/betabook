# Legacy parity tests

This private workspace keeps the pre-migration Next.js pages, server actions, Drizzle schema and query implementation available to the regression suite. Its framework and database packages are development dependencies. Production builds serve the React SPA and Rust Worker.

Run `pnpm test` from the repository root to run the component and Workers tests. The Workers suite uses this workspace's disposable local bindings and applies the same SQL migrations as the Rust Worker. Test-runner aliases resolve historical module names in the reference files. The root TypeScript configuration also resolves their data contracts for type-only client imports.

Run `pnpm db:generate` from the root to compare the Drizzle schema with the snapshots and generate SQL in `backend/migrations`. Review database triggers and constraints in any generated migration before applying it.
