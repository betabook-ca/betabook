import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SuggestedGradeField } from "./send-fields";

const meta = {
  title: "Components/Journal/Suggested grade",
  component: SuggestedGradeField,
  args: { climbType: "boulder", value: "5", onChange: () => {} },
  decorators: [
    (Story) => (
      <StoryPage
        title="Suggested grade"
        description="The same short grade field used in Log entry. Always holds a grade — it defaults to the climb's posted grade, so there is no None option."
      >
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <SuggestedGradeField {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof SuggestedGradeField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Boulder: Story = {};
export const Rope: Story = { args: { climbType: "sport", value: "15" } };
