import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { authTransport } from "@/.storybook/mocks/auth-client";

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

/** The page hands over the outcome of a Google round trip. */
export const WithError: Story = {
  args: { googleEnabled: true, initialError: "Google sign-in was cancelled." },
};

/** The address exists but was never verified: the form offers a resend,
 * bound to the address that was tried rather than whatever is typed next. */
export const UnverifiedEmail: Story = {
  beforeEach: () => {
    mocked(authTransport).mockImplementation(async () =>
      Response.json({ code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }, { status: 403 }),
    );
    return () => mocked(authTransport).mockReset();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Email" }), "climber@example.com");
    await userEvent.type(canvas.getByLabelText("Password"), "password123");
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }));
    await canvas.findByRole("button", { name: "Resend verification email" });
  },
};
