# Frontend

The Vite SPA and React Router routes live in `src/spa/`, reusable UI in `src/components/`, pure client logic in `src/lib/`, and gallery examples in `stories/`. Use `@/` across source directories and relative imports between siblings. Keep shared UI primitives independent of features. Respect the browser targets in `package.json` and the library baseline in `tsconfig.json`.

## React memoization

Let the React Compiler optimize the SPA. Write plain components, calculations, and callbacks. Do not add `React.memo` (including the named `memo` import), `useMemo`, or `useCallback` for render performance.

When changing existing manual memoization, verify any behavior that depends on reference identity, such as an effect subscription or a third-party integration. Use state or a ref when a value must persist across renders.

## Working on a feature

- For UI and story changes, use the [design system and gallery guide](../docs/frontend/storybook.md). Exercise the affected browser specs, and inspect the relevant story on desktop and mobile in both themes.
- For route or metadata changes, keep the client routes aligned with the [Worker router](../backend/worker/AGENTS.md). Use the generated HTTP contract for requests.
- For edits to user Markdown, preserve source text, escape raw HTML, turn images into links, and allow absolute HTTP, HTTPS or mailto links. Keep the React preview aligned with the Worker renderer.
- For mounted component, hook or SPA tests, use the [Vitest guide](../docs/testing/vitest.md). Use the [feature references](../docs/features/) when changing product rules.
- For user-facing workflow changes, record whether a tutorial needs updating and why. For lesson, sample data, or replay changes, read the [product tour guide](../docs/features/product-tours.md).
