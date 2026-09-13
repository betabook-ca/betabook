import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { InlineAlert } from "./inline-alert";

const meta = {
  title: "Components/Feedback/Inline alert",
  component: InlineAlert,
  args: { children: "Could not complete this action." },
  decorators: [
    (Story) => (
      <StoryPage
        title="Inline alerts"
        description="Use InlineAlert for operation errors and feedback banners. Danger announces an error immediately; warning, success, and information announce politely. Keep recovery actions next to the message. Use FieldFeedback inside invalid fields to retain the input association. Loading states, counts, and row statuses remain lightweight; confirmations use the existing dialog components."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof InlineAlert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Error: Story = {
  args: { children: "The ascent date can't be later than a logged repeat." },
};
export const Warning: Story = {
  args: {
    status: "warning",
    title: "Review imported values",
    children:
      "Imported values will replace your existing send data for already-logged climbs. This cannot be undone.",
  },
};
export const Success: Story = { args: { status: "success", children: "Display name updated." } };
export const Information: Story = {
  args: { status: "accent", children: "Your request was submitted for review." },
};
export const LongMessage: Story = {
  args: {
    children: `Could not import this profile: https://example.test/${"long-profile-name-".repeat(12)}. Check the address and try again.`,
  },
};
function RetryExample() {
  const [done, setDone] = useState(false);
  return done ? (
    <InlineAlert status="success">Details loaded.</InlineAlert>
  ) : (
    <InlineAlert action={<Button onPress={() => setDone(true)}>Try again</Button>}>
      Could not load your send.
    </InlineAlert>
  );
}
export const WithRecovery: Story = { render: () => <RetryExample /> };
