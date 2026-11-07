import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { climbListSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListIndex } from "./climb-list-index";

const meta = {
  title: "Components/Climb lists/List index",
  component: ClimbListIndex,
  args: { userId: "alex", canEdit: true, lists: climbListSamples },
} satisfies Meta<typeof ClimbListIndex>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { note: "Visible to Friends · Change" },
  render: (args) => (
    <StoryPage
      title="Lists"
      description="The owner's lists, most recently changed first. The note says who can see all of them, from the one Lists setting."
    >
      <ClimbListIndex {...args} />
    </StoryPage>
  ),
};

export const Empty: Story = {
  args: { lists: [] },
  render: (args) => (
    <StoryPage
      title="Lists"
      description="Before the first list. The empty state holds the only New list button."
    >
      <ClimbListIndex {...args} />
    </StoryPage>
  ),
};

/** Another climber's lists. No owner menu and no New list. */
export const Visitor: Story = {
  args: { canEdit: false },
  render: (args) => (
    <StoryPage title="Lists">
      <ClimbListIndex {...args} />
    </StoryPage>
  ),
};
