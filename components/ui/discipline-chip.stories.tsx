import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DisciplineChip } from "./discipline-chip";
const meta = {
  title: "Components/Data display/Discipline chip",
  component: DisciplineChip,
  args: { type: "boulder" },
  decorators: [
    (Story) => (
      <StoryPage title="Discipline chip">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof DisciplineChip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Boulder: Story = {};
export const Sport: Story = { args: { type: "sport" } };
export const Trad: Story = { args: { type: "trad" } };
