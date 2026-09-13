import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SETTINGS_ROW_CLASS, SettingsSection } from "@/components/ui/settings";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareProfileControls } from "./share-profile-controls";

const meta = {
  title: "Components/Account/Share profile",
  component: ShareProfileControls,
  decorators: [
    (Story) => (
      <StoryPage title="Share profile">
        <SettingsSection id="profile" title="Profile">
          <div className={SETTINGS_ROW_CLASS}>
            <Story />
          </div>
        </SettingsSection>
      </StoryPage>
    ),
  ],
  args: {
    name: "Alex Rivera",
    url: "https://betabook.ca/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  },
} satisfies Meta<typeof ShareProfileControls>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Public: Story = {};
export const PrivateProfile: Story = { args: { url: null } };
