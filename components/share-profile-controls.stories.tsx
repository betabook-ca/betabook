import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ShareProfileControls } from "./share-profile-controls";

const meta = {
  title: "Components/Account/Share profile",
  component: ShareProfileControls,
  decorators: [
    (Story) => (
      <StoryPage title="Share profile">
        <section className={`flex flex-col gap-4 ${cardClass("md")}`}>
          <div className="flex flex-col gap-1">
            <SectionHeading>Share profile</SectionHeading>
            <p className="text-sm text-muted">
              Invite climbers with a link or QR code. People who open it see your name and profile
              photo and can sign up.
            </p>
          </div>
          <Story />
        </section>
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
