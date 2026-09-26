import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked, userEvent, within } from "storybook/test";

import { authTransport } from "@/.storybook/mocks/auth-client";

import { ResetPasswordForm } from "./reset-password-form";

const meta = {
  title: "Components/Auth/Reset password",
  component: ResetPasswordForm,
  args: { token: "sample-reset-token" },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResetPasswordForm>;
export default meta;
type Story = StoryObj<typeof meta>;

async function submit(canvasElement: HTMLElement, confirmation: string) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText("New password"), "correct horse battery");
  await userEvent.type(canvas.getByLabelText("Confirm new password"), confirmation);
  await userEvent.click(canvas.getByRole("button", { name: "Reset password" }));
}

export const Default: Story = {};

/** Caught before any request: the confirm field is flagged, nothing is sent. */
export const Mismatch: Story = {
  play: async ({ canvasElement }) => {
    await submit(canvasElement, "correct horse batter");
    await within(canvasElement).findByText("Passwords do not match.");
  },
};

export const Done: Story = {
  beforeEach: () => {
    mocked(authTransport).mockImplementation(async () => Response.json({ status: true }));
    return () => mocked(authTransport).mockReset();
  },
  play: async ({ canvasElement }) => {
    await submit(canvasElement, "correct horse battery");
    await within(canvasElement).findByRole("heading", { name: "Password reset" });
  },
};

/** The link outlived its token between page load and submit. */
export const ExpiredToken: Story = {
  beforeEach: () => {
    mocked(authTransport).mockImplementation(async () =>
      Response.json({ code: "INVALID_TOKEN", message: "Invalid token" }, { status: 400 }),
    );
    return () => mocked(authTransport).mockReset();
  },
  play: async ({ canvasElement }) => {
    await submit(canvasElement, "correct horse battery");
    await within(canvasElement).findByRole("alert");
  },
};
