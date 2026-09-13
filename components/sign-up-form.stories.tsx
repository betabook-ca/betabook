import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SignUpForm } from "./sign-up-form";

const meta = {
  title: "Components/Auth/Sign up",
  component: SignUpForm,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignUpForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Email: Story = {};
export const WithGoogle: Story = { args: { googleEnabled: true } };
