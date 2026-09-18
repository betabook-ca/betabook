import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { setShowProfilePhoto } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { ProfilePhotoToggle } from "./profile-photo-toggle";

vi.mock("@/actions", () => ({ setShowProfilePhoto: vi.fn<() => Promise<ActionResult>>() }));
// The avatar's photo is the assertion, not the request: expose the resolved src
// without a network fetch, and render nothing when it falls back to initials.
vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-testid="avatar-photo" data-src={src} />,
}));

const PHOTO = "https://lh3.googleusercontent.com/a/alex=s96-c";
const save = vi.mocked(setShowProfilePhoto);

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ ok: true, value: undefined });
});

function renderToggle(initialShowPhoto = true) {
  return render(
    <ProfilePhotoToggle name="Alex Rivera" image={PHOTO} initialShowPhoto={initialShowPhoto} />,
  );
}

const photo = () => screen.queryByTestId("avatar-photo");
const toggle = () => screen.getByRole("switch", { name: "Show profile photo" });

it("saves the choice to hide the photo and previews initials instead", async () => {
  const user = userEvent.setup();
  renderToggle();
  expect(toggle()).toBeChecked();
  expect(photo()).toHaveAttribute("data-src", PHOTO);
  expect(toggle()).toHaveAccessibleDescription(/Your Google photo appears anywhere you show up/);

  await user.click(toggle());

  await waitFor(() => expect(toggle()).not.toBeChecked());
  expect(save).toHaveBeenCalledExactlyOnceWith(false);
  // The preview is the confirmation: initials replace the photo before the
  // action's refresh() reaches the surrounding server components.
  expect(photo()).toBeNull();
  expect(screen.getByText("AR")).toBeVisible();
  expect(toggle()).toHaveAccessibleDescription(/Your initials appear anywhere you show up/);
});

it("saves the choice to show it again", async () => {
  const user = userEvent.setup();
  renderToggle(false);
  expect(toggle()).not.toBeChecked();
  expect(photo()).toBeNull();

  await user.click(toggle());

  await waitFor(() => expect(toggle()).toBeChecked());
  expect(save).toHaveBeenCalledExactlyOnceWith(true);
  expect(photo()).toHaveAttribute("data-src", PHOTO);
});

it("restores the previous choice and explains a rejected save", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: false, error: "Your session expired. Sign in again." });
  renderToggle();

  await user.click(toggle());

  expect(await screen.findByText("Your session expired. Sign in again.")).toBeVisible();
  // Rolled back rather than left claiming a state the server never stored.
  expect(toggle()).toBeChecked();
  expect(photo()).toHaveAttribute("data-src", PHOTO);
});

it("restores the previous choice when the action throws", async () => {
  const user = userEvent.setup();
  save.mockRejectedValue(new Error("offline"));
  renderToggle(false);

  await user.click(toggle());

  expect(await screen.findByText("Couldn't save your photo choice. Try again.")).toBeVisible();
  expect(toggle()).not.toBeChecked();
  expect(photo()).toBeNull();
});

it("clears a stale error and ignores repeat clicks while a save is pending", async () => {
  const user = userEvent.setup();
  save.mockResolvedValueOnce({ ok: false, error: "Couldn't reach Betabook." });
  renderToggle();

  await user.click(toggle());
  expect(await screen.findByText("Couldn't reach Betabook.")).toBeVisible();

  let release: () => void = () => {};
  save.mockImplementationOnce(
    () => new Promise((resolve) => (release = () => resolve({ ok: true, value: undefined }))),
  );

  await user.click(toggle());
  await waitFor(() => expect(toggle()).toBeDisabled());
  expect(screen.queryByText("Couldn't reach Betabook.")).toBeNull();

  await user.click(toggle());
  expect(save).toHaveBeenCalledTimes(2);

  release();
  await waitFor(() => expect(toggle()).toBeEnabled());
  expect(toggle()).not.toBeChecked();
});
