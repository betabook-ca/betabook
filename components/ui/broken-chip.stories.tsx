import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { BrokenChip } from "./broken-chip";
import { DisciplineChip } from "./discipline-chip";
import { Grade } from "./grade";

const meta = {
  title: "Components/Data display/Broken chip",
  component: BrokenChip,
  args: { brokenOn: "2026-03-05" },
  decorators: [
    (Story) => (
      <StoryPage title="Cedar Arete">
        <div className="flex items-center gap-2">
          <Grade size="md">V4</Grade>
          <DisciplineChip type="boulder" />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof BrokenChip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Beside the grade and discipline wherever the climb is named: the one red
 * fact a climb can carry, with the date as real text for screen readers. */
export const Default: Story = {};
