# React components

Read the adjacent story before changing a component. Use [Storybook](../../../docs/frontend/storybook.md) to find existing primitives and verify the result. For dialogs, drawers, confirmations, or keyboard-sensitive layouts, follow the [overlay guide](../../../docs/frontend/overlays.md).

Colocate component tests with the production component. Use the [Vitest guide](../../../docs/testing/vitest.md) for state, callbacks, submitted values, errors and async behavior. Use the [browser test guide](../../../tests/ui/AGENTS.md) for real layout, native interactions and routing. When moving behavior coverage into jsdom, remove its duplicate browser assertions and keep the browser-specific checks.
