import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SignInForm } from "./sign-in-form";

const meta = {
  title: "Components/Auth/Sign in",
  component: SignInForm,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SignInForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithGoogle: Story = { args: { googleEnabled: true } };
