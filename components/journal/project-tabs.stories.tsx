import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectTabs } from "./project-tabs";

const meta = {
  title: "Components/Journal/Project tabs",
  component: ProjectTabs,
  args: { view: "open", userId: "sample" },
  decorators: [
    (Story) => (
      <StoryPage title="Projects">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ProjectTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Open and Sent are two views of one list, so they are pills under the
 * Projects workspace tab rather than tabs beside it. */
export const Open: Story = {};
export const Sent: Story = { args: { view: "sent" } };
