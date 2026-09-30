import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { watchOverlayKinds } from "@/test/overlay-kinds";
import { stubViewport } from "@/test/viewport";

import { TripShare } from "./trip-share";

const URL = "https://betabook.ca/users/alex/trips/7?share=0123456789abcdef0123456789abcdef";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const share = vi.fn<(data: ShareData) => Promise<void>>();

beforeEach(() => {
  share.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "userAgent");
});

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Share" }));
  return screen.findByRole("dialog", { name: "Share trip" });
}

it("shows the trip link and explains it is the profile link", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(<TripShare tripName="Bishop, March 2026" url={URL} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const overlays = watchOverlayKinds();

  const dialog = await open(user);
  expect(overlays.seen).toEqual(["modal"]);
  overlays.stop();
  expect(within(dialog).getByRole("textbox", { name: "Trip link" })).toHaveValue(URL);
  expect(
    within(dialog).getByText(
      "Anyone with this link can see this trip and the rest of your profile. It uses your profile link, so resetting that link turns this one off.",
    ),
  ).toBeVisible();
  expect(
    within(dialog).getByRole("link", { name: "Reset link in Account settings" }),
  ).toHaveAttribute("href", "/account#profile");

  await user.click(within(dialog).getByRole("button", { name: "Copy link" }));
  expect(await navigator.clipboard.readText()).toBe(URL);
  expect(within(dialog).getByRole("status")).toHaveTextContent("Link copied");
  expect(within(dialog).queryByRole("button", { name: "Share link" })).not.toBeInTheDocument();
});

it("opens the share sheet on a phone with the trip's name", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  const user = userEvent.setup();
  render(<TripShare tripName="Bishop, March 2026" url={URL} />);

  const dialog = await open(user);
  await user.click(await within(dialog).findByRole("button", { name: "Share link" }));

  expect(share).toHaveBeenCalledExactlyOnceWith({
    title: "Bishop, March 2026 on Betabook",
    url: URL,
  });
});

it("explains why there is no link when the profile is private", async () => {
  const user = userEvent.setup();
  render(<TripShare tripName="Bishop, March 2026" url={null} />);

  const dialog = await open(user);
  expect(within(dialog).getByText("Sharing is off while your profile is private.")).toBeVisible();
  expect(within(dialog).getByRole("link", { name: "Change privacy settings" })).toHaveAttribute(
    "href",
    "/account#privacy",
  );
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
});
