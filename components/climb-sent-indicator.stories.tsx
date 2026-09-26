import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbSentIndicator } from "./climb-sent-indicator";

const meta = {
  title: "Components/Data display/Climb sent indicator",
  component: ClimbSentIndicator,
  args: {
    climb: { id: -1, areaId: -1, name: "Cedar Arete", type: "boulder", grade: 5, brokenOn: null },
  },
  decorators: [
    (Story) => (
      <StoryPage title="Cedar Arete">
        <div className="flex items-center gap-3">
          <Story />
          <span className="text-sm">Cedar Arete</span>
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbSentIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The tick: this climber has sent it, and the button logs another session. */
export const Sent: Story = { args: { sent: true } };

/** The log glyph: not sent yet, and the button opens the entry form. */
export const Unsent: Story = { args: { sent: false } };
