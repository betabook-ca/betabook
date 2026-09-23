import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { deleteTrip, saveTrip } from "@/actions";
import type { TripSummary } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { TripList } from "./trip-list";

vi.mock("@/actions", () => ({
  deleteTrip: vi.fn<() => Promise<ActionResult>>(),
  saveTrip: vi.fn<() => Promise<ActionResult<number>>>(),
}));

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<(href: string) => void>(), refresh }),
}));

const TODAY = "2026-04-15";

const past: TripSummary = {
  id: 1,
  name: "Bishop, March 2026",
  description: "Buttermilks.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 14,
  sendCount: 9,
  dayCount: 7,
};
const current: TripSummary = {
  id: 2,
  name: "Spring road trip",
  description: null,
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  entryCount: 6,
  sendCount: 3,
  dayCount: 4,
};
const upcoming: TripSummary = {
  id: 3,
  name: "Squamish, July 2026",
  description: null,
  startDate: "2026-07-04",
  endDate: "2026-07-18",
  entryCount: 0,
  sendCount: 0,
  dayCount: 0,
};

beforeEach(() => {
  vi.mocked(deleteTrip).mockReset();
  vi.mocked(deleteTrip).mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(saveTrip).mockReset();
  refresh.mockReset();
});

it("offers exactly one way to start a trip, wherever the list stands", () => {
  const { rerender } = render(<TripList trips={[]} userId="alex" today={TODAY} />);
  expect(screen.getAllByRole("button", { name: /new trip/i })).toHaveLength(1);

  rerender(<TripList trips={[past]} userId="alex" today={TODAY} />);
  expect(screen.getAllByRole("button", { name: /new trip/i })).toHaveLength(1);
});

it("shows each trip's counts and links its name to the trip", () => {
  render(<TripList trips={[past]} userId="alex" today={TODAY} />);

  const card = screen.getByRole("listitem");
  expect(within(card).getByRole("link", { name: "Bishop, March 2026" })).toHaveAttribute(
    "href",
    "/users/alex/trips/1",
  );
  expect(card).toHaveTextContent("7 days out");
  expect(card).toHaveTextContent("14 entries");
  expect(card).toHaveTextContent("9 sends");
});

it("badges only the trips whose status is worth saying, against the given day", () => {
  render(<TripList trips={[upcoming, current, past]} userId="alex" today={TODAY} />);

  const [upcomingCard, currentCard, pastCard] = screen.getAllByRole("listitem");
  expect(upcomingCard).toHaveTextContent("Upcoming");
  expect(currentCard).toHaveTextContent("On now");
  expect(pastCard).not.toHaveTextContent("Upcoming");
  expect(pastCard).not.toHaveTextContent("On now");
});

it("says plainly that deleting a trip keeps the climbing, then deletes it", async () => {
  const user = userEvent.setup();
  render(<TripList trips={[past]} userId="alex" today={TODAY} />);

  await user.click(screen.getByRole("button", { name: "Actions for Bishop, March 2026" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Delete Bishop, March 2026?");
  expect(dialog).toHaveTextContent(/stays exactly where it is/i);

  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith(1));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("keeps the trip listed and shows the reason when the delete is refused", async () => {
  const user = userEvent.setup();
  vi.mocked(deleteTrip).mockResolvedValue({ ok: false, error: "Trip not found" });
  render(<TripList trips={[past]} userId="alex" today={TODAY} />);

  await user.click(screen.getByRole("button", { name: "Actions for Bishop, March 2026" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(await screen.findByText("Trip not found")).toBeInTheDocument();
  // The dialog is modal, so the list behind it is out of the accessibility
  // tree — `hidden` reaches it to prove the row survived the refused delete.
  expect(
    screen.getByRole("link", { name: "Bishop, March 2026", hidden: true }),
  ).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it("reopens an edited trip showing what was saved, not what it used to say", async () => {
  const user = userEvent.setup();
  vi.mocked(saveTrip).mockResolvedValue({ ok: true, value: past.id });
  const { rerender } = render(<TripList trips={[past]} userId="alex" today={TODAY} />);

  await user.click(screen.getByRole("button", { name: `Actions for ${past.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

  const name = await screen.findByRole("textbox", { name: /name/i });
  await user.clear(name);
  await user.type(name, "Bishop, take two");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalled());

  // The server accepted it, so the list re-renders with the saved trip. The
  // dialog closes on a timer, and its reset reads whichever trip it was last
  // handed — which is how a stale draft survives into the next session.
  const saved = { ...past, name: "Bishop, take two" };
  rerender(<TripList trips={[saved]} userId="alex" today={TODAY} />);
  await new Promise((resolve) => setTimeout(resolve, 400));

  await user.click(screen.getByRole("button", { name: `Actions for ${saved.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

  expect(await screen.findByRole("textbox", { name: /name/i })).toHaveValue("Bishop, take two");
});
