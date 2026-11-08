import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { climbListItemSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListEditor } from "./climb-list-editor";

const meta = {
  title: "Components/Climb lists/Editor",
  component: ClimbListEditor,
  args: { items: climbListItemSamples, listId: 1, listTitle: "Projects", onClose: () => {} },
  render: (args) => (
    <StoryPage
      title="Edit"
      description="Drag a climb by its handle or use the arrows, and remove climbs. Nothing saves until Save, which sends the order and removals once."
    >
      <ClimbListEditor {...args} />
    </StoryPage>
  ),
} satisfies Meta<typeof ClimbListEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
