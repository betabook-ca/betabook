import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { removeProfilePhoto } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { RemoveProfilePhotoButton } from "./remove-profile-photo-button";

vi.mock("@/actions", () => ({ removeProfilePhoto: vi.fn<() => Promise<ActionResult>>() }));

const remove = vi.mocked(removeProfilePhoto);

beforeEach(() => {
  remove.mockReset();
  remove.mockResolvedValue({ ok: true, value: undefined });
});

const trigger = () => screen.getByRole("button", { name: "Remove photo" });
const confirm = () => screen.getByRole("button", { name: "Remove" });

it("confirms before clearing the photo, because the URL is gone afterwards", async () => {
  const user = userEvent.setup();
  render(<RemoveProfilePhotoButton />);

  await user.click(trigger());

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Remove your profile photo?");
  // The warning has to say it is permanent: nothing re-fetches the URL.
  expect(dialog).toHaveTextContent(/signing in with Google again won't bring it back/i);
  expect(remove).not.toHaveBeenCalled();

  await user.click(confirm());

  await waitFor(() => expect(remove).toHaveBeenCalledOnce());
});

it("does not remove anything when the confirmation is cancelled", async () => {
  const user = userEvent.setup();
  render(<RemoveProfilePhotoButton />);

  await user.click(trigger());
  await user.click(await screen.findByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(remove).not.toHaveBeenCalled();
});

it("keeps the dialog open and explains a rejected removal", async () => {
  const user = userEvent.setup();
  remove.mockResolvedValue({ ok: false, error: "Your session expired. Sign in again." });
  render(<RemoveProfilePhotoButton />);

  await user.click(trigger());
  await user.click(await screen.findByRole("button", { name: "Remove" }));

  expect(await screen.findByText("Your session expired. Sign in again.")).toBeVisible();
  // Still open, so the climber can retry rather than wonder what happened.
  expect(screen.getByRole("alertdialog")).toBeVisible();
});

it("explains a removal that threw", async () => {
  const user = userEvent.setup();
  remove.mockRejectedValue(new Error("offline"));
  render(<RemoveProfilePhotoButton />);

  await user.click(trigger());
  await user.click(await screen.findByRole("button", { name: "Remove" }));

  expect(await screen.findByText("Couldn't remove your photo. Try again.")).toBeVisible();
  expect(screen.getByRole("alertdialog")).toBeVisible();
});

it("ignores a repeat confirm while the first one is still running", async () => {
  const user = userEvent.setup();
  let release: () => void = () => {};
  remove.mockImplementation(
    () => new Promise((resolve) => (release = () => resolve({ ok: true, value: undefined }))),
  );
  render(<RemoveProfilePhotoButton />);

  await user.click(trigger());
  await user.click(await screen.findByRole("button", { name: "Remove" }));

  // The shared dialog swaps the confirm label for "Saving…" while pending.
  const saving = await screen.findByRole("button", { name: "Saving…" });
  expect(saving).toBeDisabled();
  await user.click(saving);
  expect(remove).toHaveBeenCalledOnce();

  release();
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});
