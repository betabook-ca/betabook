import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { setSendAlertPreferences } from "@/spa/lib/actions-client";

import { SendAlertControls } from "./send-alert-controls";

vi.mock("@/spa/lib/actions-client", () => ({
  setSendAlertPreferences:
    vi.fn<(preferences: { shareWithFriends: boolean; receive: boolean }) => Promise<unknown>>(),
}));

vi.mock("@/components/push-device-control", () => ({
  PushDeviceControl: ({ publicKey }: { publicKey: string }) => <p>Device push with {publicKey}</p>,
}));

const save = vi.mocked(setSendAlertPreferences);

it("offers device push only while alerts are on and push is configured", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: true, value: undefined });
  const { rerender } = render(
    <SendAlertControls initial={{ shareWithFriends: true, receive: true }} pushPublicKey="key" />,
  );
  expect(screen.getByText("Device push with key")).toBeInTheDocument();

  await user.click(screen.getByRole("switch", { name: "Get alerts when friends log sends" }));
  expect(screen.queryByText(/Device push/)).not.toBeInTheDocument();

  rerender(<SendAlertControls initial={{ shareWithFriends: true, receive: true }} />);
  expect(screen.queryByText(/Device push/)).not.toBeInTheDocument();
});

afterEach(() => {
  save.mockReset();
});

const share = () => screen.getByRole("switch", { name: "Alert friends when I log a send" });
const receive = () => screen.getByRole("switch", { name: "Get alerts when friends log sends" });

it("saves both settings together when one switch changes", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: true, value: undefined });
  render(<SendAlertControls initial={{ shareWithFriends: true, receive: true }} />);
  expect(share()).toBeChecked();
  expect(receive()).toBeChecked();

  await user.click(receive());

  expect(save).toHaveBeenCalledWith({ shareWithFriends: true, receive: false });
  await waitFor(() => expect(receive()).toBeEnabled());
  expect(receive()).not.toBeChecked();

  await user.click(share());
  expect(save).toHaveBeenLastCalledWith({ shareWithFriends: false, receive: false });
});

it("reverts and shows the action's message when the save is refused", async () => {
  const user = userEvent.setup();
  save.mockResolvedValue({ ok: false, error: "Sign in to change alerts" });
  render(<SendAlertControls initial={{ shareWithFriends: true, receive: true }} />);

  await user.click(share());

  await waitFor(() => expect(share()).toBeChecked());
  expect(screen.getByText("Sign in to change alerts")).toBeInTheDocument();
});

it("reverts with a generic message when the request fails", async () => {
  const user = userEvent.setup();
  save.mockRejectedValue(new Error("offline"));
  render(<SendAlertControls initial={{ shareWithFriends: false, receive: true }} />);

  await user.click(share());

  await waitFor(() => expect(share()).not.toBeChecked());
  expect(screen.getByText("Couldn't save send alerts. Try again.")).toBeInTheDocument();
});
