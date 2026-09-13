import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useArgs } from "storybook/preview-api";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { OptionSelect } from "./option-select";
const meta = {
  title: "Components/Inputs/Option select",
  component: OptionSelect,
  args: {
    ariaLabel: "Discipline",
    value: "boulder",
    options: [
      { value: "boulder", label: "Boulder" },
      { value: "sport", label: "Sport" },
      { value: "trad", label: "Trad" },
    ],
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="Option select">
        <Story />
      </StoryPage>
    ),
  ],
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return <OptionSelect {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof OptionSelect>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
