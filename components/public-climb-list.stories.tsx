import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { PublicClimbList } from "./public-climb-list";

const meta = {
  title: "Components/Climbs/Public names",
  component: PublicClimbList,
  decorators: [
    (Story) => (
      <StoryPage title="Public climbs">
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    areaId: -1,
    query: "",
    initial: {
      climbs: [
        {
          id: -1,
          name: "Cedar Arete",
          areaId: -1,
          areaName: "Cedar Grove",
          grade: 5,
          type: "boulder",
          description: "A clean arete.",
          avgRating: 4.2,
          sendCount: 37,
        },
        {
          id: -2,
          name: "Long Traverse Across the Cedar Grove Boulders",
          grade: 3,
          type: "boulder",
          description: null,
          areaId: -1,
          areaName: "Cedar Grove",
          avgRating: null,
          sendCount: 0,
        },
      ],
      areaBreadcrumbs: { [-1]: [{ id: -2, name: "North Woods" }] },
      hasNextPage: false,
    },
  },
} satisfies Meta<typeof PublicClimbList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NamesOnly: Story = {};
export const Empty: Story = {
  args: { initial: { climbs: [], areaBreadcrumbs: {}, hasNextPage: false } },
};
