import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { buildSeason } from "@/lib/climber-season";
import {
  STORY_CLIMBER_OVERVIEW,
  STORY_NEW_CLIMBER_OVERVIEW,
} from "@/stories/fixtures/climber-overview";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SeasonRidge } from "./season-ridge";

const meta = {
  title: "Components/Charts/Season ridge",
  component: SeasonRidge,
  args: { season: STORY_CLIMBER_OVERVIEW.season, counting: "days out" },
  decorators: [
    (Story) => (
      <StoryPage title="Last 12 months">
        <div className="max-w-68">
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof SeasonRidge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DaysOut: Story = {};
export const SendingDays: Story = {
  args: {
    season: buildSeason(["2026-06-06", "2026-06-07", "2026-08-15", "2026-09-01"], "2026-09-04"),
    counting: "sending days",
  },
};
export const NoActivity: Story = {
  args: { season: STORY_NEW_CLIMBER_OVERVIEW.season },
};
