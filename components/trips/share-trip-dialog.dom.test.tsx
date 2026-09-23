import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { shareTrip, unshareTrip } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { ShareTripDialog, type TripShare } from "./share-trip-dialog";

vi.mock("@/actions", () => ({
  shareTrip: vi.fn<() => Promise<ActionResult<{ token: string; expiresAt: string | null }>>>(),
  unshareTrip: vi.fn<() => Promise<ActionResult>>(),
}));

const TOKEN = "4f9c2a7e1b8d6035c9e4a1f7b2d80e36";
const ORIGIN = "https://betabook.ca";
const TRIP = 7;
const EXPIRES = "2026-10-20 12:00:00";

function Example({ share = null }: { share?: TripShare } = {}) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <ShareTripDialog
      state={state}
      tripId={TRIP}
      tripName="Bishop, March 2026"
      share={share}
      shareOrigin={ORIGIN}
    />
  );
}

beforeEach(() => {
  vi.mocked(shareTrip).mockReset();
  vi.mocked(unshareTrip).mockReset();
  vi.mocked(shareTrip).mockResolvedValue({ ok: true, value: { token: TOKEN, expiresAt: EXPIRES } });
  vi.mocked(unshareTrip).mockResolvedValue({ ok: true, value: undefined });
});

it("says what the link carries before it exists, and names no audience", () => {
  render(<Example />);

  // The consent the shared page rests on, in the one-line house form.
  expect(
    screen.getByText("Anyone with the link sees this trip's sessions, notes and sends."),
  ).toBeInTheDocument();
  expect(screen.getByText("Climbers you tagged aren't named.")).toBeInTheDocument();

  // A link cannot enforce who holds it, so it must not offer to.
  for (const audience of [/friends/i, /members/i, /only me/i, /audience/i]) {
    expect(screen.queryByText(audience)).not.toBeInTheDocument();
  }
});

it("creates a link and shows the deadline the server computed", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Create link" }));

  await waitFor(() => expect(shareTrip).toHaveBeenCalledWith(TRIP, "30d"));
  const field = await screen.findByRole("textbox", { name: /trip link/i });
  expect(field).toHaveValue(`${ORIGIN}/trips/${TOKEN}`);
  expect(screen.getByText(/Link expires/)).toBeInTheDocument();
});

it("renews rather than replaces, and says the link already sent goes on working", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, expiresAt: EXPIRES }} />);

  expect(screen.getByRole("button", { name: "Renew link" })).toBeInTheDocument();
  expect(screen.getByText(/keeps the same link/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Renew link" }));
  await waitFor(() => expect(shareTrip).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole("textbox", { name: /trip link/i })).toHaveValue(
    `${ORIGIN}/trips/${TOKEN}`,
  );
});

it("confirms before stopping, and says the climbing is kept", async () => {
  const user = userEvent.setup();
  render(<Example share={{ token: TOKEN, expiresAt: null }} />);

  await user.click(screen.getByRole("button", { name: "Stop sharing" }));

  const confirm = await screen.findByRole("alertdialog");
  expect(confirm).toHaveTextContent(/sessions, notes and sends are kept/i);

  await user.click(within(confirm).getByRole("button", { name: "Stop sharing" }));
  await waitFor(() => expect(unshareTrip).toHaveBeenCalledWith(TRIP));
  expect(await screen.findByText("Sharing stopped.")).toBeInTheDocument();
});

it("stays open with the server's own message when sharing is refused", async () => {
  const user = userEvent.setup();
  vi.mocked(shareTrip).mockResolvedValue({
    ok: false,
    error: "Sharing is off while your profile is private — change it in Account settings.",
  });
  render(<Example />);

  await user.click(screen.getByRole("button", { name: "Create link" }));

  expect(await screen.findByText(/profile is private/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
});
