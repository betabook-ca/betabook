import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { STORY_HARDEST } from "@/stories/fixtures/climber-hardest";

import { ProfileHeading } from "./profile-heading";
import { ProfileTabs } from "./profile-tabs";

const meta = {
  title: "Components/Profile/Sections",
  component: ProfileTabs,
  args: { userId: "sample", showJournal: true, showProjects: true },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-4">
        <ProfileHeading name="Alex Morgan" hardest={STORY_HARDEST} />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileTabs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Journal: Story = {
  parameters: { nextjs: { navigation: { pathname: "/users/sample" } } },
};
export const OtherClimber: Story = {
  args: { showProjects: false },
  parameters: { nextjs: { navigation: { pathname: "/users/sample/journal" } } },
};
