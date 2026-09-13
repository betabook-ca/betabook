import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { FeatureCallout } from "./feature-callout";

const meta = {
  title: "Components/Feature callout",
  component: FeatureCallout,
  args: {
    title: "Your journal, organized",
    description:
      "Add tags to your sessions and training. Find the days you want to revisit with a quick filter.",
    isOpen: true,
    onDismiss: () => {},
    children: <Button variant="secondary">Journal tags</Button>,
  },
  decorators: [
    (Story) => (
      <StoryPage title="Feature callout">
        <div className="min-h-96 pt-6">
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Use one short title and one or two sentences. The arrow points to the feature; the rest of the page stays usable. Use FeatureAnnouncement for account-backed dismissal. This presentation story keeps the callout open for visual review.",
      },
    },
  },
} satisfies Meta<typeof FeatureCallout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Saving: Story = { args: { isPending: true } };
export const SaveFailed: Story = { args: { error: "Couldn’t save your dismissal." } };
export const NearRightEdge: Story = {
  decorators: [
    (Story) => (
      <div className="flex justify-end">
        <Story />
      </div>
    ),
  ],
};
