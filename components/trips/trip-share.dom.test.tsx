import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { shareTrip, unshareTrip } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import { watchOverlayKinds } from "@/test/overlay-kinds";
import { stubViewport } from "@/test/viewport";

import { TripShare } from "./trip-share";

vi.mock("@/actions", () => ({
  shareTrip: vi.fn<() => Promise<ActionResult<{ token: string; expiresAt: string | null }>>>(),
  unshareTrip: vi.fn<() => Promise<ActionResult>>(),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const ORIGIN = "https://betabook.ca";
const TRIP = 7;
const EXPIRES = "2026-11-18 12:00:00";

beforeEach(() => {
  vi.mocked(shareTrip)
    .mockReset()
    .mockResolvedValue({
      ok: true,
      value: { token: TOKEN, expiresAt: EXPIRES },
    });
  vi.mocked(unshareTrip).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("says what the link shows before one exists, then creates the trip's own link", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(
    <TripShare
      tripId={TRIP}
      tripName="Bishop"
      share={null}
      shareOrigin={ORIGIN}
      isPrivate={false}
    />,
  );
  const overlays = watchOverlayKinds();

  await user.click(screen.getByRole("button", { name: "Share" }));
  const dialog = await screen.findByRole("dialog", { name: "Share Bishop" });
  overlays.stop();
  expect(overlays.seen).toEqual(["modal"]);
  expect(
    within(dialog).getByText(
      "Anyone with the link sees this trip: its notes, photos, journal entries, sends and analytics.",
    ),
  ).toBeVisible();
  expect(within(dialog).getByText("Climbers you tagged aren't named.")).toBeVisible();
  expect(within(dialog).queryByRole("textbox", { name: "Trip link" })).not.toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Create link" }));

  expect(shareTrip).toHaveBeenCalledExactlyOnceWith(TRIP, "30d");
  expect(await within(dialog).findByRole("textbox", { name: "Trip link" })).toHaveValue(
    `${ORIGIN}/trips/${TOKEN}`,
  );
});

it("stops sharing a live link after confirming", async () => {
  const user = userEvent.setup();
  render(
    <TripShare
      tripId={TRIP}
      tripName="Bishop"
      share={{ token: TOKEN, expiresAt: EXPIRES }}
      shareOrigin={ORIGIN}
      isPrivate={false}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Shared" }));
  const dialog = await screen.findByRole("dialog", { name: "Share Bishop" });
  expect(within(dialog).getByRole("textbox", { name: "Trip link" })).toHaveValue(
    `${ORIGIN}/trips/${TOKEN}`,
  );
  await user.click(within(dialog).getByRole("button", { name: "Stop sharing" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Stop sharing Bishop?" });
  await user.click(within(confirm).getByRole("button", { name: "Stop sharing" }));

  await waitFor(() => expect(unshareTrip).toHaveBeenCalledExactlyOnceWith(TRIP));
  expect(await within(dialog).findByRole("status")).toHaveTextContent("Sharing stopped.");
  expect(within(dialog).queryByRole("textbox", { name: "Trip link" })).not.toBeInTheDocument();
});

it("keeps the dialog open with the reason when sharing is refused", async () => {
  vi.mocked(shareTrip).mockResolvedValue({
    ok: false,
    error: "Sharing is off while your profile is private.",
  });
  const user = userEvent.setup();
  render(
    <TripShare
      tripId={TRIP}
      tripName="Bishop"
      share={null}
      shareOrigin={ORIGIN}
      isPrivate={false}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Share" }));
  const dialog = await screen.findByRole("dialog", { name: "Share Bishop" });
  await user.click(within(dialog).getByRole("button", { name: "Create link" }));

  expect(
    await within(dialog).findByText("Sharing is off while your profile is private."),
  ).toBeVisible();
  expect(within(dialog).queryByRole("textbox", { name: "Trip link" })).not.toBeInTheDocument();
});

it("explains that sharing is off while the profile is private, instead of offering a link", async () => {
  const user = userEvent.setup();
  render(<TripShare tripId={TRIP} tripName="Bishop" share={null} shareOrigin={ORIGIN} isPrivate />);

  await user.click(screen.getByRole("button", { name: "Share" }));
  const dialog = await screen.findByRole("dialog", { name: "Share Bishop" });
  expect(within(dialog).getByText("Sharing is off while your profile is private.")).toBeVisible();
  expect(within(dialog).getByRole("link", { name: "Change privacy settings" })).toHaveAttribute(
    "href",
    "/account#privacy",
  );
  expect(within(dialog).queryByRole("button", { name: "Create link" })).not.toBeInTheDocument();
  expect(shareTrip).not.toHaveBeenCalled();
});
