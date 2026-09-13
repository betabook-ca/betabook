import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { BreakthroughList } from "./breakthrough-list";

const meta = {
  title: "Components/Charts/Breakthroughs",
  component: BreakthroughList,
  args: {
    breakthroughs: [
      {
        type: "boulder",
        grade: 7,
        label: "V6",
        climbId: 1,
        climbName: "The Long Way Around the Corner",
        dateSent: "2026-06-04",
        waitDays: 120,
      },
      {
        type: "boulder",
        grade: 5,
        label: "V4",
        climbId: 2,
        climbName: "Cedar Arete",
        dateSent: "2026-02-04",
        waitDays: null,
      },
    ],
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Breakthroughs"
        description="Half-width on the dashboard; long climb names wrap rather than disappear."
      >
        <div className={`max-w-md ${cardClass("sm")}`}>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Sends that raised the selected period’s grade ceiling, newest first. Each entry links to its climb and shows the date and wait since the previous breakthrough.",
      },
    },
  },
} satisfies Meta<typeof BreakthroughList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Milestones: Story = {};
