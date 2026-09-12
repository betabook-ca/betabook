import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { TERMS_VERSION, termsHref } from "@/lib/terms";
import { stubTurnstile } from "@/test/turnstile";

import { SignUpForm } from "./sign-up-form";

type SignupCallbacks = {
  onError: (context: { error: { message: string } }) => void;
  onResponse: () => void;
};
const { signUp, social } = vi.hoisted(() => ({
  signUp: vi.fn<(body: unknown, callbacks: SignupCallbacks) => void>(),
  social: vi.fn<(body: unknown, options: unknown) => Promise<unknown>>(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUp }, signIn: { social } },
}));
vi.mock("next/script", () => import("@/test/turnstile"));

beforeEach(() => vi.clearAllMocks());

it("requires an explicit agreement for both registration paths", async () => {
  const user = userEvent.setup();
  render(<SignUpForm googleEnabled next="/climbs/1" />);
  const submit = screen.getByRole("button", { name: "Sign up" });
  const google = screen.getByRole("button", { name: "Continue with Google" });
  expect(submit).toBeDisabled();
  expect(google).toBeDisabled();
  const agreement = screen.getByRole("checkbox", { name: /I agree to the Terms of Service/ });
  expect(agreement).not.toBeChecked();
  expect(screen.getByRole("link", { name: /Terms of Service/ })).toHaveAttribute(
    "href",
    termsHref(),
  );
  await user.click(agreement);
  expect(submit).toBeEnabled();
  expect(google).toBeEnabled();
  await user.click(agreement);
  expect(submit).toBeDisabled();
  expect(google).toBeDisabled();
  expect(signUp).not.toHaveBeenCalled();
  expect(social).not.toHaveBeenCalled();
  await user.click(agreement);
  await user.click(google);
  expect(social).toHaveBeenCalledWith(
    expect.objectContaining({
      callbackURL: "/climbs/1",
      additionalData: { acceptedTermsVersion: TERMS_VERSION },
    }),
    expect.any(Object),
  );
});

it("submits the displayed terms version and preserves the agreement on a failed signup", async () => {
  const user = userEvent.setup();
  render(<SignUpForm next="/climbs/1" />);
  await user.type(screen.getByRole("textbox", { name: "Display name" }), "Test Climber");
  await user.type(screen.getByRole("textbox", { name: "Email" }), "new@example.com");
  await user.type(screen.getByLabelText("Password", { exact: true }), "password123");
  await user.type(screen.getByLabelText("Confirm password"), "password123");
  const agreement = screen.getByRole("checkbox", { name: /I agree to the Terms of Service/ });
  await user.click(agreement);
  const submit = screen.getByRole("button", { name: "Sign up" });
  await user.click(submit);
  expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({
      email: "new@example.com",
      callbackURL: "/sign-in?next=%2Fclimbs%2F1",
    }),
    expect.objectContaining({ body: { acceptedTermsVersion: TERMS_VERSION } }),
  );
  expect(submit).toBeDisabled();
  await user.click(submit);
  expect(signUp).toHaveBeenCalledTimes(1);
  const callbacks = signUp.mock.calls[0][1];
  await act(async () => {
    callbacks.onError({ error: { message: "Please try again" } });
    callbacks.onResponse();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Please try again");
  expect(agreement).toBeChecked();
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("new@example.com");
  await user.click(submit);
  expect(signUp).toHaveBeenCalledTimes(2);
});

it("sends the Turnstile token with the registration and resets the widget after a failure", async () => {
  const { turnstile, solve } = stubTurnstile();
  const user = userEvent.setup();
  render(<SignUpForm turnstileSiteKey="site-key" />);
  await user.type(screen.getByRole("textbox", { name: "Display name" }), "Test Climber");
  await user.type(screen.getByRole("textbox", { name: "Email" }), "new@example.com");
  await user.type(screen.getByLabelText("Password", { exact: true }), "password123");
  await user.type(screen.getByLabelText("Confirm password"), "password123");
  await user.click(screen.getByRole("checkbox", { name: /I agree to the Terms of Service/ }));
  const submit = screen.getByRole("button", { name: "Sign up" });
  expect(submit).toBeDisabled();

  await solve("token-1");
  await user.click(submit);
  expect(signUp).toHaveBeenCalledWith(
    expect.objectContaining({ email: "new@example.com" }),
    expect.objectContaining({ headers: { "x-captcha-response": "token-1" } }),
  );
  const callbacks = signUp.mock.calls[0][1];
  await act(async () => {
    callbacks.onError({ error: { message: "Captcha verification failed" } });
    callbacks.onResponse();
  });
  expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  expect(submit).toBeDisabled();
});
