import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { resetProfileShareLink } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { ShareProfileControls } from "./share-profile-controls";

vi.mock("@/actions", () => ({ resetProfileShareLink: vi.fn<() => Promise<ActionResult>>() }));
vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a>,
}));

const FIRST = "https://betabook.ca/users/owner-1?share=0123456789abcdef0123456789abcdef";
const SECOND = "https://betabook.ca/users/owner-1?share=fedcba9876543210fedcba9876543210";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const reset = vi.mocked(resetProfileShareLink);
const share = vi.fn<(data: ShareData) => Promise<void>>();

beforeEach(() => {
  reset.mockReset();
  share.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "userAgent");
});

it("shows the current link and its QR code and copies the link", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<ShareProfileControls name="Alex Rivera" url={FIRST} />);
  const field = screen.getByRole("textbox", { name: "Profile link" });
  const qr = screen.getByRole("img", { name: "QR code for your profile link" });
  const firstCode = qr.querySelector("path")?.getAttribute("d");

  expect(field).toHaveValue(FIRST);
  expect(screen.queryByRole("button", { name: "Share link" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await navigator.clipboard.readText()).toBe(FIRST);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");

  rerender(<ShareProfileControls name="Alex Rivera" url={SECOND} />);
  expect(field).toHaveValue(SECOND);
  expect(qr.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
  expect(qr.querySelector("path")?.getAttribute("d")).not.toBe(firstCode);
});

it("opens the share sheet on a phone", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  const user = userEvent.setup();
  render(<ShareProfileControls name="Alex Rivera" url={FIRST} />);

  await user.click(await screen.findByRole("button", { name: "Share link" }));

  expect(share).toHaveBeenCalledExactlyOnceWith({ title: "Alex Rivera on Betabook", url: FIRST });
});

it("resets the link only after confirmation and keeps the dialog open on failure", async () => {
  reset
    .mockResolvedValueOnce({ ok: false, error: "Your session has expired." })
    .mockResolvedValueOnce({ ok: true, value: undefined });
  const user = userEvent.setup();
  render(<ShareProfileControls name="Alex Rivera" url={FIRST} />);

  await user.click(screen.getByRole("button", { name: "Reset link" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Reset your profile link?" });
  expect(
    within(dialog).getByText("Links and QR codes you've already shared will stop working."),
  ).toBeVisible();
  expect(reset).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole("button", { name: "Reset link" }));
  expect(await within(dialog).findByText("Your session has expired.")).toBeVisible();

  const retry = await within(dialog).findByRole("button", { name: "Reset link" });
  await waitFor(() => expect(retry).toBeEnabled());
  await user.click(retry);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(reset).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("status")).toHaveTextContent(/^Link reset\.$/);
});

it("ignores repeated confirmation while a reset is saving", async () => {
  let finish!: (result: ActionResult) => void;
  reset.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const user = userEvent.setup();
  render(<ShareProfileControls name="Alex Rivera" url={FIRST} />);

  await user.click(screen.getByRole("button", { name: "Reset link" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Reset your profile link?" });
  await user.click(within(dialog).getByRole("button", { name: "Reset link" }));
  const saving = await within(dialog).findByRole("button", { name: "Saving…" });
  expect(saving).toBeDisabled();
  await user.click(saving);
  expect(reset).toHaveBeenCalledOnce();

  finish({ ok: true, value: undefined });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
});

it("turns sharing off while the profile is private", () => {
  render(<ShareProfileControls name="Alex Rivera" url={null} />);

  expect(screen.getByText("Sharing is off while your profile is private.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Change privacy settings" })).toHaveAttribute(
    "href",
    "#privacy",
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
