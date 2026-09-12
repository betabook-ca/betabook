import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { stubTurnstile } from "@/test/turnstile";

import { ForgotPasswordForm } from "./forgot-password-form";

type ResetOptions = {
  headers?: Record<string, string>;
  onError: (context: { error: { message: string } }) => void;
  onResponse: () => void;
};
const { requestPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn<(body: unknown, options: ResetOptions) => void>(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { requestPasswordReset } }));
vi.mock("next/script", () => import("@/test/turnstile"));

it("sends the Turnstile token with a reset request and needs a new one to retry", async () => {
  const { turnstile, solve } = stubTurnstile();
  const user = userEvent.setup();
  render(<ForgotPasswordForm turnstileSiteKey="site-key" />);
  await user.type(screen.getByRole("textbox", { name: "Email" }), "climber@example.com");
  const submit = screen.getByRole("button", { name: "Send reset link" });
  expect(submit).toBeDisabled();

  await solve("token-1");
  await user.click(submit);
  expect(requestPasswordReset).toHaveBeenCalledWith(
    { email: "climber@example.com", redirectTo: "/reset-password" },
    expect.objectContaining({ headers: { "x-captcha-response": "token-1" } }),
  );

  const options = requestPasswordReset.mock.calls[0][1];
  await act(async () => {
    options.onError({ error: { message: "Captcha verification failed" } });
    options.onResponse();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Captcha verification failed");
  expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  expect(submit).toBeDisabled();
});
