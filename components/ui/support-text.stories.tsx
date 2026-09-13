import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InlineAlert } from "@/components/ui/inline-alert";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SupportText } from "./support-text";

const meta = {
  title: "Components/Feedback/Support text",
  component: SupportText,
  args: {
    subject: "Sendage import",
    children:
      "Sendage returned an unfamiliar data format. Please try again later, or email support@betabook.ca.",
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Support text"
        description="Use SupportText for feedback that names the support address. The address opens an email with the subject and message filled in."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof SupportText>;
export default meta;
type Story = StoryObj<typeof meta>;
export const InError: Story = {
  render: (args) => (
    <InlineAlert>
      <SupportText {...args} />
    </InlineAlert>
  ),
};
export const InWarning: Story = {
  args: {
    subject: "Sendage profile @climber",
    children:
      "Sendage lists 50 sends, but its activity feed returned 49. Check for missing sends after importing, or email support@betabook.ca.",
  },
  render: (args) => (
    <InlineAlert status="warning">
      <SupportText {...args} />
    </InlineAlert>
  ),
};
