import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { stubTurnstile } from "@/test/turnstile";

import { SignInForm } from "./sign-in-form";

type SignInOptions = {
  headers?: Record<string, string>;
  onError: (context: { error: { status: number; code?: string; message: string } }) => void;
  onResponse: () => void;
};
const { signInEmail } = vi.hoisted(() => ({
  signInEmail: vi.fn<(body: unknown, options: SignInOptions) => void>(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmail }, sendVerificationEmail: vi.fn<() => void>() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(path: string) => void>() }),
}));
vi.mock("next/script", () => import("@/test/turnstile"));

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Email" }), "climber@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
}

it("waits for a Turnstile token, sends it once and requests a new one after the response", async () => {
  const { turnstile, solve } = stubTurnstile();
  const user = userEvent.setup();
  render(<SignInForm turnstileSiteKey="site-key" />);
  await fillCredentials(user);
  const submit = screen.getByRole("button", { name: "Sign in" });
  expect(submit).toBeDisabled();
  expect(turnstile.render).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({ sitekey: "site-key" }),
  );

  await solve("token-1");
  await user.click(submit);
  expect(signInEmail).toHaveBeenCalledWith(
    { email: "climber@example.com", password: "password123" },
    expect.objectContaining({ headers: { "x-captcha-response": "token-1" } }),
  );

  const options = signInEmail.mock.calls[0][1];
  await act(async () => {
    options.onError({
      error: { status: 403, code: "VERIFICATION_FAILED", message: "Captcha verification failed" },
    });
    options.onResponse();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Captcha verification failed");
  expect(screen.queryByText(/verify your email address/)).not.toBeInTheDocument();
  expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  expect(submit).toBeDisabled();
  await solve("token-2");
  expect(submit).toBeEnabled();
});

it("offers to resend verification for an unverified email", async () => {
  const { turnstile } = stubTurnstile();
  const user = userEvent.setup();
  render(<SignInForm />);
  await fillCredentials(user);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(turnstile.render).not.toHaveBeenCalled();
  const options = signInEmail.mock.calls[0][1];
  expect(options.headers).toBeUndefined();
  await act(async () => {
    options.onError({
      error: { status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    options.onResponse();
  });
  expect(screen.getByText("Please verify your email address before signing in.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
});
