import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { currentPushSubscription, disablePush, enablePush, pushSupport } from "@/lib/push";

import { PushDeviceControl } from "./push-device-control";

vi.mock("@/lib/push", () => ({
  pushSupport: vi.fn<() => string>(),
  currentPushSubscription: vi.fn<() => Promise<unknown>>(),
  enablePush: vi.fn<(key: string) => Promise<unknown>>(),
  disablePush: vi.fn<() => Promise<void>>(),
}));

const support = vi.mocked(pushSupport);
const current = vi.mocked(currentPushSubscription);
const enable = vi.mocked(enablePush);
const disable = vi.mocked(disablePush);

beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "default" });
  support.mockReturnValue("supported");
  current.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("turns push on for this device with the server's key", async () => {
  const user = userEvent.setup();
  enable.mockResolvedValue({ ok: true });
  render(<PushDeviceControl publicKey="server-key" />);

  await user.click(await screen.findByRole("button", { name: "Turn on for this device" }));

  expect(enable).toHaveBeenCalledWith("server-key");
  expect(await screen.findByText("Notifications are on for this device.")).toBeInTheDocument();
});

it("turns push off when this device is already subscribed", async () => {
  const user = userEvent.setup();
  current.mockResolvedValue({ endpoint: "https://fcm.googleapis.com/fcm/send/x" } as never);
  disable.mockResolvedValue();
  render(<PushDeviceControl publicKey="server-key" />);

  await user.click(await screen.findByRole("button", { name: "Turn off for this device" }));

  expect(disable).toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Turn on for this device" })).toBeEnabled();
});

it("explains a refused permission without offering the button again", async () => {
  const user = userEvent.setup();
  enable.mockImplementation(async () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    return {
      ok: false,
      error: "Notifications are blocked for Betabook in this browser's settings.",
    };
  });
  render(<PushDeviceControl publicKey="server-key" />);

  await user.click(await screen.findByRole("button", { name: "Turn on for this device" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("blocked");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("tells iPhone and iPad tabs to add Betabook to the Home Screen", () => {
  support.mockReturnValue("install");
  render(<PushDeviceControl publicKey="server-key" />);
  expect(screen.getByText(/add Betabook to your Home Screen/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
