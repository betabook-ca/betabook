import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { EYEBROW_CLASS } from "./eyebrow";
import { StatValue } from "./stat-value";

const meta = {
  title: "Components/Data display/Stat value",
  component: StatValue,
  args: { children: "128" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Stat value"
        description="The big number under an eyebrow, in the display face and tabular so columns line up. A tone flags a count that needs attention."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof StatValue>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Values: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <span className={EYEBROW_CLASS}>Sends</span>
        <StatValue>128</StatValue>
      </div>
      <div className="flex flex-col gap-1">
        <span className={EYEBROW_CLASS}>Total per month</span>
        <StatValue>$8.40</StatValue>
      </div>
      <div className="flex flex-col gap-1">
        <span className={EYEBROW_CLASS}>Unmatched</span>
        <StatValue tone="warning">3</StatValue>
      </div>
      <div className="flex flex-col gap-1">
        <span className={EYEBROW_CLASS}>Can’t import</span>
        <StatValue tone="danger">2</StatValue>
      </div>
    </div>
  ),
};
