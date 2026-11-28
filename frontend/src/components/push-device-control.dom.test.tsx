import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { claimPushSubscription, disablePush, enablePush, pushSupport } from "@/lib/push";

import { PushDeviceControl } from "./push-device-control";

vi.mock("@/lib/push", () => ({
  pushSupport: vi.fn<() => string>(),
  claimPushSubscription: vi.fn<() => Promise<boolean>>(),
  enablePush: vi.fn<(key: string) => Promise<unknown>>(),
  disablePush: vi.fn<() => Promise<void>>(),
}));

const support = vi.mocked(pushSupport);
const claim = vi.mocked(claimPushSubscription);
const enable = vi.mocked(enablePush);
const disable = vi.mocked(disablePush);

beforeEach(() => {
  vi.stubGlobal("Notification", { permission: "default" });
  support.mockReturnValue("supported");
  claim.mockResolvedValue(false);
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

it("claims an existing subscription for the signed-in account before showing it on", async () => {
  claim.mockResolvedValue(true);
  render(<PushDeviceControl publicKey="server-key" />);
  expect(await screen.findByText("Notifications are on for this device.")).toBeInTheDocument();
  expect(claim).toHaveBeenCalledTimes(1);
});

it("shows push off when this account can't claim the device's subscription", async () => {
  claim.mockRejectedValue(new Error("offline"));
  render(<PushDeviceControl publicKey="server-key" />);
  expect(await screen.findByRole("button", { name: "Turn on for this device" })).toBeEnabled();
});

it("turns push off when this device is already subscribed", async () => {
  const user = userEvent.setup();
  claim.mockResolvedValue(true);
  disable.mockResolvedValue();
  render(<PushDeviceControl publicKey="server-key" />);

  await user.click(await screen.findByRole("button", { name: "Turn off for this device" }));

  expect(disable).toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Turn on for this device" })).toBeEnabled();
});

it("explains a refused permission once, without offering the button again", async () => {
  const user = userEvent.setup();
  enable.mockResolvedValue({ ok: false, error: null });
  render(<PushDeviceControl publicKey="server-key" />);

  await user.click(await screen.findByRole("button", { name: "Turn on for this device" }));

  expect(await screen.findByText(/blocked for Betabook/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("tells iPhone and iPad tabs to add Betabook to the Home Screen", () => {
  support.mockReturnValue("install");
  render(<PushDeviceControl publicKey="server-key" />);
  expect(screen.getByText(/add Betabook to your Home Screen/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
