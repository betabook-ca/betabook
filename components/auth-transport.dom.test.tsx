import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { DeleteAccountButton } from "./delete-account-button";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordButton } from "./reset-password-button";
import { ResetPasswordForm } from "./reset-password-form";
import { SignInForm } from "./sign-in-form";
import { SignOutButton } from "./sign-out-button";
import { SignUpForm } from "./sign-up-form";

const { transport, navigation } = vi.hoisted(() => ({
  transport: vi.fn<typeof fetch>(),
  navigation: { push: vi.fn<(href: string) => void>(), refresh: vi.fn<() => void>() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/auth-client", async () => {
  const { createAuthClient } = await import("better-auth/react");
  return {
    authClient: createAuthClient({
      baseURL: "http://localhost:3000",
      fetchOptions: { customFetchImpl: transport },
    }),
  };
});

beforeEach(() => {
  transport.mockReset().mockImplementation(async () => Response.json({ user: { id: "owner" } }));
  navigation.push.mockClear();
  navigation.refresh.mockClear();
});

const cases = [
  { name: "sign in", content: <SignInForm />, button: "Sign in", endpoint: "/sign-in/email" },
  { name: "sign up", content: <SignUpForm />, button: "Sign up", endpoint: "/sign-up/email" },
  {
    name: "forgot password",
    content: <ForgotPasswordForm />,
    button: "Send reset link",
    endpoint: "/request-password-reset",
  },
  {
    name: "account password reset",
    content: <ResetPasswordButton email="reader@example.com" />,
    button: "Reset password",
    endpoint: "/request-password-reset",
  },
  {
    name: "set new password",
    content: <ResetPasswordForm token="reset-token" />,
    button: "Reset password",
    endpoint: "/reset-password",
  },
  { name: "sign out", content: <SignOutButton />, button: "Sign out", endpoint: "/sign-out" },
  {
    name: "delete account",
    content: <DeleteAccountButton />,
    button: "Delete",
    endpoint: "/delete-user",
  },
];
const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  for (const input of screen.queryAllByRole("textbox")) {
    await user.type(
      input,
      input.getAttribute("type") === "email" ? "reader@example.com" : "Reader",
    );
  }
  for (const label of ["Password", "Confirm password", "New password", "Confirm new password"]) {
    const input = screen.queryByLabelText(label, { exact: true });
    if (input) await user.type(input, "password123");
  }
  const agreement = screen.queryByRole("checkbox", { name: /I agree/ });
  if (agreement) await user.click(agreement);
}

it.each(cases)(
  "recovers $name after an offline request and retries the same payload",
  async ({ content, button, endpoint }) => {
    transport.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(content);
    await fillForm(user);
    if (button === "Delete")
      await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i);
    const retry = screen.getByRole("button", { name: button });
    expect(retry).toBeEnabled();
    await user.click(retry);
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(requestUrl(transport.mock.calls[0][0])).toContain(endpoint);
    expect(transport.mock.calls[1][1]?.body).toBe(transport.mock.calls[0][1]?.body);
  },
);

it.each(["sign in", "sign up"])("retries an offline verification resend from %s", async (flow) => {
  transport
    .mockImplementationOnce(async () =>
      flow === "sign in"
        ? Response.json(
            { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
            { status: 403 },
          )
        : Response.json({ user: { id: "owner" } }),
    )
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  const user = userEvent.setup();
  render(flow === "sign in" ? <SignInForm /> : <SignUpForm />);
  await fillForm(user);
  await user.click(
    screen.getByRole("button", { name: flow === "sign in" ? "Sign in" : "Sign up" }),
  );
  await user.click(await screen.findByRole("button", { name: "Resend verification email" }));
  expect(await screen.findByText("Something went wrong. Please try again.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Resend verification email" }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
  expect(transport.mock.calls[2][1]?.body).toBe(transport.mock.calls[1][1]?.body);
  expect(requestUrl(transport.mock.calls[2][0])).toContain("/send-verification-email");
});
