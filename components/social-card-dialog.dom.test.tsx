import type { UseOverlayStateReturn } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { prepareRecapShare } from "@/actions";
import { downloadBlob } from "@/lib/download";

import { SocialCardDialog } from "./social-card-dialog";

vi.mock("@/lib/download", () => ({ downloadBlob: vi.fn<typeof downloadBlob>() }));
vi.mock("@/actions", () => ({ prepareRecapShare: vi.fn<typeof prepareRecapShare>() }));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const RECAP_TOKEN = "ASNFZ4mrze8BI0VniavN7w";

const download = vi.mocked(downloadBlob);
const prepare = vi.mocked(prepareRecapShare);
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
  prepare.mockReset().mockResolvedValue({
    ok: true,
    value: { token: RECAP_TOKEN, path: `/r/${RECAP_TOKEN}` },
  });
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
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(window, "isSecureContext");
});

it("fetches the yearly image only after the dialog opens", async () => {
  const { rerender } = render(
    <SocialCardDialog state={overlayState(false)} userId="climber1" name="Alex Rivera" />,
  );
  expect(fetchMock).not.toHaveBeenCalled();

  rerender(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/og/stats-card/climber1?period=year"),
  );
  const preview = await screen.findByRole("img", { name: "2026 Year in review card preview" });
  expect(preview).toHaveAttribute("src", "blob:mock-url");
  expect(screen.queryByRole("button", { name: "This month" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "All time" })).not.toBeInTheDocument();
});

it("shows an error instead of a stale or broken preview when generation fails", async () => {
  fetchMock.mockResolvedValue({ ok: false } as Response);

  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't generate your card. Try again.",
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

it("clears a generation error after the dialog is reopened and succeeds", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false } as Response);
  const { rerender } = render(
    <SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />,
  );
  await screen.findByRole("alert");

  rerender(<SocialCardDialog state={overlayState(false)} userId="climber1" name="Alex Rivera" />);
  rerender(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("downloads the generated card under a year-in-review filename", async () => {
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  await user.click(screen.getByRole("button", { name: "Download" }));

  expect(download).toHaveBeenCalledExactlyOnceWith(
    expect.any(Blob),
    "betabook-2026-year-in-review.png",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Downloaded");
});

it("has no Share button on a desktop browser without the Web Share API", async () => {
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  expect(screen.queryByRole("button", { name: "Share to app" })).not.toBeInTheDocument();
});

it("explains why sharing to apps is unavailable on an HTTP phone origin", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ANDROID });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  expect(screen.getByRole("button", { name: "Share to app" })).toBeDisabled();
  expect(screen.getByText(/Open this page over HTTPS to choose an app/)).toBeVisible();
});

it("shares the card as a file on a phone that supports sharing files", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  shareMock.mockReset().mockResolvedValue(undefined);
  canShareMock.mockReset().mockReturnValue(true);
  const user = userEvent.setup();
  render(
    <SocialCardDialog
      state={overlayState(true)}
      userId="climber1"
      name="Alex Rivera"
      linkedRecapAvailable
    />,
  );
  await screen.findByRole("img", { name: "2026 Year in review card preview" });
  expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  expect(prepare).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(`/api/og/recap/${RECAP_TOKEN}`, {
    cache: "no-store",
  });
  expect(screen.getByRole("link", { name: "Preview all recap pages" })).toHaveAttribute(
    "href",
    `/r/${RECAP_TOKEN}`,
  );

  await user.click(await screen.findByRole("button", { name: "Share to app" }));

  expect(shareMock).toHaveBeenCalledOnce();
  const [data] = shareMock.mock.calls[0];
  expect(data.title).toBe("Alex Rivera's 2026 Betabook year in review");
  expect(data.text).toBe(`View my climbing progress\n${window.location.origin}/r/${RECAP_TOKEN}`);
  expect(data.files).toHaveLength(1);
  expect(data.files?.[0].name).toBe("betabook-2026-year-in-review.png");
  expect(data.files?.[0].type).toBe("image/png");
  expect(download).not.toHaveBeenCalled();
});

it("copies the frozen recap link for desktop sharing", async () => {
  const copy = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  render(
    <SocialCardDialog
      state={overlayState(true)}
      userId="climber1"
      name="Alex Rivera"
      linkedRecapAvailable
    />,
  );
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  const copyButton = screen.getByRole("button", { name: "Copy recap link" });
  await waitFor(() => expect(copyButton).toBeEnabled());
  await user.click(copyButton);
  expect(copy).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/r/${RECAP_TOKEN}`);
  expect(screen.getByRole("status")).toHaveTextContent("Recap link copied");
});

it("keeps native image sharing available after a clipboard failure", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  canShareMock.mockReset().mockReturnValue(true);
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi
        .fn<(text: string) => Promise<void>>()
        .mockRejectedValue(new Error("Clipboard denied")),
    },
  });
  render(
    <SocialCardDialog
      state={overlayState(true)}
      userId="climber1"
      name="Alex Rivera"
      linkedRecapAvailable
    />,
  );
  await screen.findByRole("img", { name: "2026 Year in review card preview" });
  const copyButton = screen.getByRole("button", { name: "Copy recap link" });
  await waitFor(() => expect(copyButton).toBeEnabled());
  await user.click(copyButton);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't copy the recap link");
  expect(screen.getByRole("button", { name: "Share to app" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
});

it("releases the preview image URL when the dialog closes", async () => {
  const user = userEvent.setup();
  const state = overlayState(true);
  render(<SocialCardDialog state={state} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(state.setOpen).toHaveBeenCalledWith(false);
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url"));
});

it("does not share a stale card if preparing the linked recap fails", async () => {
  prepare.mockResolvedValue({ ok: false, error: "Sharing is unavailable." });
  render(
    <SocialCardDialog
      state={overlayState(true)}
      userId="climber1"
      name="Alex Rivera"
      linkedRecapAvailable
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is unavailable.");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole("link", { name: "Preview all recap pages" })).not.toBeInTheDocument();
});

it("omits the link for a private profile's yearly image", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  shareMock.mockReset().mockResolvedValue(undefined);
  canShareMock.mockReset().mockReturnValue(true);
  const user = userEvent.setup();
  render(
    <SocialCardDialog
      state={overlayState(true)}
      userId="climber1"
      name="Alex Rivera"
      linkedRecapAvailable={false}
    />,
  );
  await screen.findByRole("img", { name: "2026 Year in review card preview" });
  expect(screen.queryByRole("button", { name: "Copy recap link" })).not.toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "Share to app" }));
  expect(shareMock.mock.calls[0][0].text).toBe("View my climbing progress");
});

it("offers a download when the platform can't share image files", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  shareMock.mockReset();
  canShareMock.mockReset().mockReturnValue(false);
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  expect(screen.queryByRole("button", { name: "Share to app" })).not.toBeInTheDocument();
  expect(screen.getByText(/This browser can't share images to apps/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Download" }));

  expect(shareMock).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledExactlyOnceWith(
    expect.any(Blob),
    "betabook-2026-year-in-review.png",
  );
});

it("offers a download if the native share sheet fails to open", async () => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => IPHONE });
  Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: canShareMock });
  shareMock.mockReset().mockRejectedValue(new Error("No share targets"));
  canShareMock.mockReset().mockReturnValue(true);
  const user = userEvent.setup();
  render(<SocialCardDialog state={overlayState(true)} userId="climber1" name="Alex Rivera" />);
  await screen.findByRole("img", { name: "2026 Year in review card preview" });

  expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Share to app" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn't open sharing. Download it instead.",
  );
  expect(screen.getByRole("button", { name: "Download" })).toBeVisible();
});
