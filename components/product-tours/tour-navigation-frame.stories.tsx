import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { PRODUCT_TOUR_STEPS } from "@/lib/product-tour-navigation";

import { JournalTourPage } from "./journal-tour";

const meta = {
  title: "Components/Tutorials/Navigation preview",
  component: JournalTourPage,
  args: {
    section: "Journal",
    mode: "full",
    steps: PRODUCT_TOUR_STEPS.journal,
    href: (id: string) => `#${id}`,
  },
  decorators: [
    (Story) => (
      <div className="h-[36rem]">
        <Story />
      </div>
    ),
  ],
  parameters: { fullWidth: true },
} satisfies Meta<typeof JournalTourPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Logbook: Story = {};
export const Sends: Story = { args: { section: "Sends" } };
export const Progress: Story = { args: { section: "Projects" } };
export const Analytics: Story = { args: { section: "Analytics" } };
export const Community: Story = { args: { section: "Friends" } };
export const Feed: Story = { args: { section: "Feed" } };
export const Search: Story = { name: "Find climbers", args: { section: "Find climbers" } };
export const You: Story = { name: "Account settings", args: { section: "Account settings" } };
export const Updates: Story = { args: { section: "Friends", mode: "updates" } };
