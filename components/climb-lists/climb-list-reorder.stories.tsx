import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { climbListItemSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListReorder } from "./climb-list-reorder";

const meta = {
  title: "Components/Climb lists/Reorder",
  component: ClimbListReorder,
  args: { items: climbListItemSamples, listId: 1, onClose: () => {} },
  render: (args) => (
    <StoryPage
      title="Reorder"
      description="Drag a climb by its handle or use the arrows, and remove climbs. Nothing saves until Save, which sends the order and removals once."
    >
      <ClimbListReorder {...args} />
    </StoryPage>
  ),
} satisfies Meta<typeof ClimbListReorder>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
