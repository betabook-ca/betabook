import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AscentStyle } from "@/components/ascent-style";
import { SendGradeCell } from "@/components/send-grade-cell";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbLogRow } from "./climb-log-row";

const meta = {
  title: "Components/Journal/Climb log row",
  component: ClimbLogRow,
  args: {
    climb: { id: 2, name: "Cedar Arete", areaId: 3, areaName: "Granite Canyon" },
    areaBreadcrumbs: {},
    grade: <SendGradeCell type="boulder" grade={5} gradeFeel="solid" rating={3} />,
    status: <AscentStyle type="flash" />,
    date: "2026-09-04",
    comment: "A calm finish after a few good attempts.",
  },
  decorators: [
    (Story) => (
      <StoryPage title="Sends">
        <div data-climb-log-example>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbLogRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sent: Story = {};
