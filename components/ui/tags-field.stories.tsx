import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { TagsField } from "./tags-field";
const meta = {
  title: "Components/Inputs/Tags",
  component: TagsField,
  args: { value: [], tags: ["trip", "power", "outdoors"], onChange: () => {} },
  decorators: [
    (Story) => (
      <StoryPage
        title="Tags"
        description="One shared medium-width field for Journal, Sends, Analytics and Log entry. Empty creation fields show #technical, #moonboard... in muted text; existing-tag fields show only the # prefix. Selected tags appear as removable filled buttons below the field, matching selected friends. Enter, Space, or comma separate tags. Creation fields show a live count beside the label; restrictions appear only for invalid input."
      >
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <TagsField {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof TagsField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExistingTags: Story = {};
export const CreateTags: Story = {
  args: { allowCreate: true, maxTags: 8 },
};
export const Selected: Story = { args: { value: ["trip", "power"] } };
