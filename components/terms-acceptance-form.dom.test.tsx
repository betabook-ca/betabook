import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { TERMS_UPDATED_LABEL, TERMS_VERSION, termsHref } from "@/lib/terms";

import { TermsAcceptanceForm } from "./terms-acceptance-form";

const navigation = vi.hoisted(() => ({
  replace: vi.fn<(path: string) => void>(),
  refresh: vi.fn<() => void>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/actions/terms", () => ({ acceptTerms: vi.fn<() => Promise<ActionResult>>() }));

it("requires explicit consent, prevents duplicate saves, preserves errors and continues after retry", async () => {
  navigation.replace.mockReset();
  let resolve!: (result: ActionResult) => void;
  const onAccept = vi
    .fn<(version: unknown, agreed: unknown) => Promise<ActionResult>>()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ ok: true, value: undefined });
  const user = userEvent.setup();
  render(
    <TermsAcceptanceForm
      version={TERMS_VERSION}
      versionLabel={TERMS_UPDATED_LABEL}
      previousVersion="2025-01-01"
      next="/friends?view=requests"
      onAccept={onAccept}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Terms of Service" });
  expect(within(dialog).getByRole("button", { name: "Accept and continue" })).toBeVisible();
  expect(screen.getByText(/updated since your last agreement/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Read the Terms of Service" })).toHaveAttribute(
    "href",
    termsHref(),
  );
  const submit = screen.getByRole("button", { name: "Accept and continue" });
  expect(submit).toBeDisabled();
  const checkbox = screen.getByRole("checkbox", { name: "I agree to these Terms of Service" });
  await user.click(checkbox);
  await user.click(submit);
  expect(onAccept).toHaveBeenCalledWith(TERMS_VERSION, true);
  expect(checkbox).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Saving agreement…" }));
  expect(onAccept).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: false, error: "Please try again" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Please try again");
  expect(checkbox).toBeChecked();
  expect(navigation.replace).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(navigation.replace).toHaveBeenCalledWith("/friends?view=requests");
});

it("does not leave the current page when an in-place acceptance callback is provided", async () => {
  navigation.replace.mockReset();
  const onAccepted = vi.fn<() => void>();
  const user = userEvent.setup();
  render(
    <TermsAcceptanceForm
      version={TERMS_VERSION}
      versionLabel={TERMS_UPDATED_LABEL}
      previousVersion={null}
      onAccept={async () => ({ ok: true, value: undefined })}
      onAccepted={onAccepted}
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
  await user.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(onAccepted).toHaveBeenCalledTimes(1);
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("signs out without submitting the checked agreement", async () => {
  const onSignOut = vi.fn<() => void>();
  const onAccept = vi.fn<(version: unknown, agreed: unknown) => Promise<ActionResult>>();
  const user = userEvent.setup();
  render(
    <TermsAcceptanceForm
      version={TERMS_VERSION}
      versionLabel={TERMS_UPDATED_LABEL}
      previousVersion={null}
      onAccept={onAccept}
      onSignOut={onSignOut}
    />,
  );
  await user.click(screen.getByRole("checkbox", { name: /I agree/ }));
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
});
