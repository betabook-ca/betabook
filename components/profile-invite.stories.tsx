import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProfileInvite } from "./profile-invite";

const meta = {
  title: "Components/Auth/Profile invitation",
  component: ProfileInvite,
  args: {
    name: "Alex Rivera",
    image: null,
    since: 2021,
    next: "/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  },
} satisfies Meta<typeof ProfileInvite>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invitation: Story = {};
export const LongName: Story = {
  args: { name: "Alexandra Montgomery-Fitzgerald de la Cruz Rivera" },
};
