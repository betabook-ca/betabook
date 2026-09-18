import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AccountSettings } from "./account-settings";

const USER_ID = "Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu";

const meta = {
  title: "Components/Account/Settings page",
  component: AccountSettings,
  args: {
    user: { id: USER_ID, name: "Alex Rivera", email: "alex.rivera@example.com", image: null },
    isPrivate: false,
    journalVisibility: "friends",
    sendCommentVisibility: "public",
    shareUrl: `https://betabook.ca/users/${USER_ID}?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36`,
    turnstileSiteKey: null,
    catalogExport: {
      generatedAt: "2026-09-14T06:00:00.000Z",
      areaCount: 412,
      climbCount: 5083,
      size: 1_204_000,
    },
    isAdmin: false,
  },
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
} satisfies Meta<typeof AccountSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Member: Story = {};
export const PrivateProfile: Story = { args: { isPrivate: true, shareUrl: null } };
export const Moderator: Story = { args: { isAdmin: true } };

/** A Google account: Profile gains a Remove photo row. The gallery makes no
 * successful request for the URL, so the avatars fall back to initials — this
 * example is about the row, not the photo itself. */
export const WithProfilePhoto: Story = {
  args: {
    user: {
      ...meta.args.user,
      image: "https://lh3.googleusercontent.com/a/story-example=s96-c",
    },
  },
};
