import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CoveragePage } from "./coverage-reference";

const meta = { title: "Internal/Coverage", component: CoveragePage } satisfies Meta;
export default meta;
// These composed examples render their own props rather than using meta args.
type Story = StoryObj;
export const Inventory: Story = { render: () => <CoveragePage /> };
