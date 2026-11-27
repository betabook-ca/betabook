import type { Meta, StoryObj } from "@storybook/react-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SearchIcon } from "./search-icon";

const meta = {
  title: "Components/Navigation/Search icon",
  component: SearchIcon,
  args: { active: false },
  decorators: [
    (Story) => (
      <StoryPage title="Shared search icon">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "One magnifier shape across navigation, search bars, and lookup fields. Selection only increases its stroke weight.",
      },
    },
  },
} satisfies Meta<typeof SearchIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
