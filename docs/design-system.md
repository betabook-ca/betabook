# Design system

Look up design principles and component examples in
[the published Storybook](https://main--6a9d99bf69b9b54453118dcf.chromatic.com)
or the `betabook-storybook` MCP configured in [`.mcp.json`](../.mcp.json).

- Start with **Foundations / Brand and style** and **Foundations / Tokens** for
  design principles, live theme roles, typography, spacing and surfaces.
- Use **Internal / Coverage / Inventory** to find a component, then inspect its
  **Components** stories and related **Patterns** before changing UI.
- For unpublished changes or when MCP is unavailable, read the adjacent
  `components/**/*.stories.tsx` and relevant `stories/foundations/` or
  `stories/patterns/` examples. Run `pnpm storybook` to inspect the current branch
  in both themes at mobile and desktop sizes.

Reuse the production primitives and theme tokens demonstrated in the gallery.
Keep design guidance with the foundation/pattern stories and component examples;
update those sources when the design changes.

Keep this file as a short discovery guide. Change it only when gallery access or
navigation changes; routine UI PRs should not add style catalogs, feature notes
or change history here. See [Choosing and writing tests](component-testing.md)
for test selection and verification requirements.
