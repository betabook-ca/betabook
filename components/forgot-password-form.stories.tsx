import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { authTransport } from "@/.storybook/mocks/auth-client";

import { ForgotPasswordForm } from "./forgot-password-form";

const meta = {
  title: "Components/Auth/Forgot password",
  component: ForgotPasswordForm,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ForgotPasswordForm>;
export default meta;
type Story = StoryObj<typeof meta>;

async function submit(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "climber@example.com");
  await userEvent.click(canvas.getByRole("button", { name: "Send reset link" }));
}

export const Default: Story = {};

/** The request was accepted: the same wording whether or not the address
 * has an account, so the form never confirms one exists. */
export const Sent: Story = {
  beforeEach: () => {
    mocked(authTransport).mockImplementation(async () => Response.json({ status: true }));
    return () => mocked(authTransport).mockReset();
  },
  play: async ({ canvasElement }) => {
    await submit(canvasElement);
    await within(canvasElement).findByRole("heading", { name: "Check your email" });
  },
};

export const Failed: Story = {
  beforeEach: () => {
    mocked(authTransport).mockImplementation(async () =>
      Response.json({ message: "Too many requests. Try again in a minute." }, { status: 429 }),
    );
    return () => mocked(authTransport).mockReset();
  },
  play: async ({ canvasElement }) => {
    await submit(canvasElement);
    await within(canvasElement).findByRole("alert");
  },
};
