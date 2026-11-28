# React components

Components live in one folder per feature. Put a new component in the folder of the feature that owns it, not at the top level:

- `ui/` holds feature-free primitives (lint enforces that they import no other component folder). `climbing/` holds the domain's own display pieces that every feature shares: grades, disciplines, ascent styles, ratings, activity icons.
- `app-shell/` is the frame around every page: navigation, header actions, the workspace shell, command palette and announcements. `landing/` holds the public information pages.
- `areas/`, `climbs/` and `sends/` hold the catalog and logbook. `account/`, `analytics/`, `auth/`, `feed/`, `friends/`, `profile/`, `sharing/` and `terms/` hold those features, alongside the existing `admin/`, `climb-lists/`, `filters/`, `goals/`, `import/`, `journal/`, `product-tours/`, `search/` and `trips/`.

Build on HeroUI before writing a control by hand. The installed docs (`node_modules/@heroui/react/docs/`) match the installed version, and the `heroui-react` and `heroui-theming` skills read them. Restyle a HeroUI component through its custom properties or a BEM modifier in `spa/globals.css` rather than replacing it. When a hand-built control is the better choice, say why in its doc comment, as `ui/user-avatar.tsx` does.

Read the adjacent story before changing a component. Use [Storybook](../../../docs/frontend/storybook.md) to find existing primitives and verify the result. For dialogs, drawers, confirmations, or keyboard-sensitive layouts, follow the [overlay guide](../../../docs/frontend/overlays.md).

Colocate component tests with the production component. Use the [Vitest guide](../../../docs/testing/vitest.md) for state, callbacks, submitted values, errors and async behavior. Use the [browser test guide](../../../tests/ui/AGENTS.md) for real layout, native interactions and routing. When moving behavior coverage into jsdom, remove its duplicate browser assertions and keep the browser-specific checks.
