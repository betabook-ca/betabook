import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ShareProfileButton } from "./share-profile-button";

const SHARE_URL = "https://betabook.ca/users/owner-1?share=0123456789abcdef0123456789abcdef";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const UNTOUCHED = "clipboard before sharing";

const share = vi.fn<(data: ShareData) => Promise<void>>();

beforeEach(() => {
  share.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
  }));
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "userAgent");
  vi.unstubAllGlobals();
});

async function setup({ phone }: { phone: boolean }) {
  if (phone) {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  }
  const user = userEvent.setup();
  await navigator.clipboard.writeText(UNTOUCHED);
  render(<ShareProfileButton name="Alex Rivera" url={SHARE_URL} />);
  return user;
}

it("copies the share link on desktop even where a share sheet exists", async () => {
  const user = await setup({ phone: false });

  await user.click(screen.getByRole("button", { name: "Copy profile link" }));

  expect(await navigator.clipboard.readText()).toBe(SHARE_URL);
  expect(share).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});

it("opens the share sheet with the share link on a phone", async () => {
  const user = await setup({ phone: true });

  await user.click(await screen.findByRole("button", { name: "Share profile link" }));

  expect(share).toHaveBeenCalledExactlyOnceWith({
    title: "Alex Rivera on Betabook",
    url: SHARE_URL,
  });
  expect(await navigator.clipboard.readText()).toBe(UNTOUCHED);
  expect(screen.getByRole("status")).toHaveTextContent("");
});

it("leaves the clipboard alone when the share sheet is dismissed", async () => {
  share.mockRejectedValue(new DOMException("Share canceled", "AbortError"));
  const user = await setup({ phone: true });

  await user.click(await screen.findByRole("button", { name: "Share profile link" }));

  expect(share).toHaveBeenCalledOnce();
  expect(await navigator.clipboard.readText()).toBe(UNTOUCHED);
  expect(screen.getByRole("status")).toHaveTextContent("");
});

it("copies the link when the share sheet can't open", async () => {
  share.mockRejectedValue(new DOMException("Not allowed", "NotAllowedError"));
  const user = await setup({ phone: true });

  await user.click(await screen.findByRole("button", { name: "Share profile link" }));

  expect(await navigator.clipboard.readText()).toBe(SHARE_URL);
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});
