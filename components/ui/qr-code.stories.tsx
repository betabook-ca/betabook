import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { QrCode } from "./qr-code";

const meta = {
  title: "Components/Data display/QR code",
  component: QrCode,
  decorators: [
    (Story) => (
      <StoryPage
        title="QR code"
        description="Black on white with a quiet zone in both themes, so scanners keep their contrast."
      >
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    value:
      "https://betabook.ca/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
    label: "QR code for a profile link",
    className: "size-40",
  },
} satisfies Meta<typeof QrCode>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProfileLink: Story = {};
