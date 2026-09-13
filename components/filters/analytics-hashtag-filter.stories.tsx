import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { userEvent, within } from "storybook/test";

import { DisciplineChips } from "@/components/filters/discipline-chips";
import type { DisciplineFilter } from "@/lib/filters/discipline-filter";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsHashtagFilter } from "./analytics-hashtag-filter";
function DisciplineOptions() {
  const [value, setValue] = useState<DisciplineFilter["disciplines"]>(["boulder"]);
  return <DisciplineChips value={value} onChange={setValue} />;
}
const meta = {
  title: "Components/Filters/Analytics tags",
  component: AnalyticsHashtagFilter,
  args: { selectedTags: [], tags: ["trip", "power", "outdoors"], controls: <DisciplineOptions /> },
  parameters: {
    nextjs: {
      navigation: { pathname: "/users/sample/analytics", query: { discipline: "boulder" } },
    },
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Analytics tags"
        description="Expand filters to select Tags. Applied tags and Clear all stay visible when closed."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AnalyticsHashtagFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { selectedTags: ["trip"] } };

export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Expand filters" }));
  },
};
