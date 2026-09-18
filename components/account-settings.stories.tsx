import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { AccountSettings } from "./account-settings";

const USER_ID = "Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu";

// Shape-valid so hasProfilePhoto offers the Show photo switch. The gallery
// makes no successful request for it, so the avatars fall back to initials —
// these examples are about the control and its copy, not the photo itself.
const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/story-example=s96-c";

const meta = {
  title: "Components/Account/Settings page",
  component: AccountSettings,
  args: {
    user: {
      id: USER_ID,
      name: "Alex Rivera",
      email: "alex.rivera@example.com",
      image: null,
      showProfilePhoto: true,
    },
    isPrivate: false,
    journalVisibility: "friends",
    sendCommentVisibility: "public",
    shareUrl: `https://betabook.ca/users/${USER_ID}?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36`,
    turnstileSiteKey: null,
    isAdmin: false,
  },
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
} satisfies Meta<typeof AccountSettings>;
export default meta;
type Story = StoryObj<typeof meta>;
/** An email and password account: the switch stays, disabled, with the reason
 * on a help button beside it. */
export const Member: Story = {};
export const PrivateProfile: Story = { args: { isPrivate: true, shareUrl: null } };
export const Moderator: Story = { args: { isAdmin: true } };

/** A Google account: Profile gains the Show photo switch. */
export const WithProfilePhoto: Story = {
  args: { user: { ...meta.args.user, image: GOOGLE_PHOTO, showProfilePhoto: true } },
};

/** The same account after choosing initials over its photo. */
export const ProfilePhotoHidden: Story = {
  args: { user: { ...meta.args.user, image: GOOGLE_PHOTO, showProfilePhoto: false } },
};
