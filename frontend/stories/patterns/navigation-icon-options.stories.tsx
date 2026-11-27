import type { Meta, StoryObj } from "@storybook/react-vite";

import { NavigationIconOptions } from "./navigation-icon-options";

const meta = {
  title: "Patterns/Navigation icon options",
  component: NavigationIconOptions,
  parameters: { fullWidth: true, router: { navigation: { pathname: "/users/sample/journal" } } },
} satisfies Meta<typeof NavigationIconOptions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison: Story = { name: "Approved icon states" };
