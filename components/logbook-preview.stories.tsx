import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { LogbookPreview } from "./logbook-preview";

const meta = {
  title: "Components/Charts/Logbook preview",
  component: LogbookPreview,
  decorators: [
    (Story) => (
      <StoryPage title="See your progression">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof LogbookPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SampleClimber: Story = {};
