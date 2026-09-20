import type { UseOverlayStateReturn } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { downloadBlob } from "@/lib/download";

import { SocialCardDialog } from "./social-card-dialog";

vi.mock("@/lib/download", () => ({ downloadBlob: vi.fn<typeof downloadBlob>() }));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const download = vi.mocked(downloadBlob);
const fetchMock = vi.fn<typeof fetch>();
const shareMock = vi.fn<(data: ShareData) => Promise<void>>();
const canShareMock = vi.fn<(data?: ShareData) => boolean>();

function overlayState(isOpen: boolean): UseOverlayStateReturn {
  return {
    isOpen,
    setOpen: vi.fn<(open: boolean) => void>(),
    open: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    toggle: vi.fn<() => void>(),
  };
}

function pngResponse(bytes = "fake-png") {
  return {
    ok: true,
    blob: async () => new Blob([bytes], { type: "image/png" }),
  } as Response;
}

beforeEach(() => {
  download.mockReset();
  fetchMock.mockReset().mockResolvedValue(pngResponse());
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn<() => string>(() => "blob:mock-url"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn<() => void>(),
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "userAgent");
});

it("fetches the default period on open and refetches on every period change", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <SocialCardDialog state={overlayState(false)} userId="climber1" name="Alex Rivera" />,
  );
  expect(fetchMock).not.toHaveBeenCalled();

  rerender(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/og/stats-card/climber1?period=year"),
  );
  const preview = await screen.findByRole("img", { name: "This year recap card preview" });
  expect(preview).toHaveAttribute("src", "blob:mock-url");

  await user.click(screen.getByRole("button", { name: "This month" }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith("/api/og/stats-card/climber1?period=month"),
  );
  expect(await screen.findByRole("img", { name: "This month recap card preview" })).toBeVisible();
});

it("shows an error instead of a stale or broken preview when generation fails", async () => {
  fetchMock.mockResolvedValue({ ok: false } as Response);

  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't generate your card. Try again.",
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("clears a period's error once a later retry for that same period succeeds", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce({ ok: false } as Response); // "This year" fails first
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("alert");

  await user.click(screen.getByRole("button", { name: "This month" })); // succeeds (default mock)
  await screen.findByRole("img", { name: "This month recap card preview" });

  await user.click(screen.getByRole("button", { name: "This year" })); // retried, now succeeds

  await screen.findByRole("img", { name: "This year recap card preview" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("downloads the generated card under a period-named file", async () => {
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "This year recap card preview" });

  await user.click(screen.getByRole("button", { name: "Download" }));

  expect(download).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), "betabook-year-recap.png");
  expect(screen.getByRole("status")).toHaveTextContent("Downloaded");
});

it("has no Share button on a desktop browser without the Web Share API", async () => {
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "This year recap card preview" });

  expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
});

it("shares the card as a file on a phone that supports sharing files", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  shareMock.mockReset().mockResolvedValue(undefined);
  canShareMock.mockReset().mockReturnValue(true);
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "This year recap card preview" });

  await user.click(await screen.findByRole("button", { name: "Share" }));

  expect(shareMock).toHaveBeenCalledOnce();
  const [data] = shareMock.mock.calls[0];
  expect(data.title).toBe("Alex Rivera's Betabook recap");
  expect(data.files).toHaveLength(1);
  expect(data.files?.[0].name).toBe("betabook-year-recap.png");
  expect(data.files?.[0].type).toBe("image/png");
  expect(download).not.toHaveBeenCalled();
});

it("falls back to a download when the platform can't share files", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  shareMock.mockReset();
  canShareMock.mockReset().mockReturnValue(false);
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "This year recap card preview" });

  await user.click(await screen.findByRole("button", { name: "Share" }));

  expect(shareMock).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), "betabook-year-recap.png");
});
