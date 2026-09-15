import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SearchTriggerControl } from "./command-palette";

const meta = {
  title: "Components/Navigation/Search trigger",
  component: SearchTriggerControl,
  decorators: [
    (Story) => (
      <StoryPage title="Header search">
        <Story />
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Mobile gives search a wide surface with the compact Betabook mark and a search icon. Desktop keeps the keyboard shortcut alongside separate Home branding.",
      },
    },
  },
} satisfies Meta<typeof SearchTriggerControl>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Member: Story = { args: { onOpenSearch: () => {} } };
