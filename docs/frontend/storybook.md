# Design system

Look up design principles and component examples in
[the published Storybook](https://main--6a9d99bf69b9b54453118dcf.chromatic.com)
or the `betabook-storybook` MCP configured in [`.mcp.json`](../../.mcp.json).

- Start with **Foundations / Brand and style** and **Foundations / Tokens** for
  design principles, live theme roles, typography, spacing and surfaces.
- Use **Internal / Coverage / Inventory** to find a component, then inspect its
  **Components** stories and related **Patterns** before changing UI.
- For unpublished changes or when MCP is unavailable, read the adjacent
  `frontend/src/components/**/*.stories.tsx` and relevant `frontend/stories/foundations/` or
  `frontend/stories/patterns/` examples. Run `pnpm storybook` to inspect the current branch
  in both themes at mobile and desktop sizes.

Reuse the production primitives and theme tokens demonstrated in the gallery.
Keep design guidance with the foundation/pattern stories and component examples;
update those sources when the design changes.

## Story rules

Stories describe reproducible UI states and make visual review possible. Use the
real imported component, deterministic sample data and local interactions; no
live mutations or database imports. A story is not a substitute for a behavioral
test. New stories do not inherit browser tests. Prefer unit/component coverage
for their production behavior, and reserve browser checks for rendered risks.
Use one CSF file per production component module with its actual imported
`meta.component`, so the Storybook MCP manifest stays usable; closely related
exports can share that file. Put cross-component compositions in
`frontend/stories/patterns/`, design principles and tokens in `frontend/stories/foundations/`,
maintenance views in `frontend/stories/internal/`, and shared story-only fixtures in
`frontend/stories/fixtures/`. Sidebar titles follow Foundations, Components, Patterns and
Internal. Gallery reference components are documentation tooling, not production
primitives. Keep class/token helpers in foundation or pattern examples.

Change a shared component and its relevant examples together. Preserve story
titles and export names because published URLs and agent references depend on
them; update affected links and checks for intentional renames. Keep design
guidance in the gallery alongside those examples.

Explain intentional design changes in the work summary or PR. Update the affected examples and run their browser specs. For brand assets and regeneration, use the [branding guide](../../frontend/src/assets/branding/AGENTS.md).

## Chromatic publishing

`.github/workflows/chromatic.yml` publishes upstream branch Storybooks using the
`CHROMATIC_PROJECT_TOKEN` secret. It only publishes the gallery: **UI Tests and UI Review must both
stay disabled** in Chromatic's Manage settings to avoid billed snapshots, and the shared Storybook
preview sets `chromatic.disableSnapshot: true`. There are no baselines or approvals to maintain.
PRs require **Test & Build** and **UI reference**; publishing is advisory and fork PRs need no
Chromatic secret.

Connect the hosted Storybook MCP server with `codex mcp login betabook-storybook` or Claude Code's
`/mcp`. Each collaborator authenticates individually; the CI token is not an MCP login.
