import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { EmailPreview } from "./email-preview";

const meta = {
  title: "Patterns/Email",
  component: EmailPreview,
} satisfies Meta<typeof EmailPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const base = "https://example.test";
const verify = `${base}/api/auth/verify-email?token=${"sample-token-".repeat(20)}&callbackURL=%2Fsign-in`;

export const Verification: Story = {
  args: {
    title: "Verify your email",
    text: `Click the link below to verify your email address:\n\n${verify}`,
    links: [{ href: verify, label: "Verify email" }],
  },
};
export const PasswordReset: Story = {
  args: {
    title: "Reset your password",
    text: `Click the link below to reset your password:\n\n${base}/reset-password?token=sample`,
    links: [{ href: `${base}/reset-password?token=sample`, label: "Reset password" }],
  },
};
export const Welcome: Story = {
  args: {
    title: "Welcome to Betabook",
    showLinkUrls: false,
    text: `Hi Casey,\n\nYour email is verified — welcome to Betabook, a climbing logbook and crag database for keeping the routes you've climbed and the places you climbed them.\n\nSomewhere to start:\n\nAlready tracking sends somewhere else? Export a CSV and bring the whole history across.\n${base}/account/import\n\nSearch for a climb and record your first ascent.\n${base}\n\nBetabook is free, ad-free, and source available. Questions or corrections? Get in touch:\n${base}/contact`,
    links: [
      { href: `${base}/account/import`, label: "Import your logbook" },
      { href: base, label: "Log your first send" },
      { href: `${base}/contact`, label: "Get in touch" },
    ],
  },
};
export const FriendRequest: Story = {
  args: {
    title: "New friend request",
    text: `Casey & Morgan sent you a friend request on Betabook.\n\nAccept or decline the request:\n${base}/friends?view=requests`,
    links: [{ href: `${base}/friends?view=requests`, label: "View friend requests" }],
  },
};
export const Contact: Story = {
  args: {
    title: "New contact message",
    text: `From: Casey <casey@example.test>\n\nThe route description has an old approach.\nThe new trail starts near the bridge.\n\nLiteral visitor input: <img src=x onerror="alert(1)"> & <script>alert(1)</script>\n\n${"A-very-long-route-name-".repeat(20)}`,
  },
};
export const ModerationDecision: Story = {
  args: {
    title: "Your change request was rejected",
    text: `Hi Casey,\n\nAn admin has rejected your request: Rename Cedar Arete\n\n- New name: Cedar & Stone\n\nNote from the admin: The existing name matches the guidebook.\nThanks for checking!\n\n${base}/climbs/123/cedar-arete`,
    links: [{ href: `${base}/climbs/123/cedar-arete`, label: "View in Betabook" }],
  },
};
