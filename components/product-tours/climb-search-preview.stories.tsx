import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DemoClimbSearch } from "./climb-search-preview";

const meta = {
  title: "Components/Tutorials/Find climbs preview",
  component: DemoClimbSearch,
  decorators: [
    (Story) => (
      <StoryPage
        title="Tutorial Find climbs"
        description="The Find climbs lesson runs the real search controller over Pine Canyon's sample catalog. Area, discipline, grade, rating, ascents and sort narrow the fictional list locally."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof DemoClimbSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
