import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import ClimbingLogbookPage from "@/app/climbing-logbook/page";

const meta = {
  title: "Patterns/Landing pages",
  component: ClimbingLogbookPage,
} satisfies Meta<typeof ClimbingLogbookPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ClimbingLogbook: Story = {};
