import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { EmptyState } from "./empty-state";
const meta = {
  title: "Components/Feedback/Empty state",
  component: EmptyState,
  args: { message: "No sessions match these filters." },
  decorators: [
    (Story) => (
      <StoryPage title="Empty state">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoResults: Story = {};
export const WithAction: Story = {
  render: function Example() {
    const [reset, setReset] = useState(false);
    return reset ? (
      <p role="status">Showing all sample sessions.</p>
    ) : (
      <EmptyState
        message="No sessions match these filters."
        cta={<Button onPress={() => setReset(true)}>Clear sample filters</Button>}
      />
    );
  },
};
