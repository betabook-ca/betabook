import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ImportLandingPage } from "./import-landing-page";

const meta = {
  title: "Components/Landing/Import page",
  component: ImportLandingPage,
  args: { source: "kaya" },
} satisfies Meta<typeof ImportLandingPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Kaya: Story = {};
export const Sendage: Story = { args: { source: "sendage" } };
export const MountainProject: Story = { args: { source: "mountainProject" } };
