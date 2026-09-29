import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { deleteTrip, saveTrip } from "@/actions";
import type { TripSummary } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { watchOverlayKinds } from "@/test/overlay-kinds";
import { stubViewport } from "@/test/viewport";

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
  albumUrl: null,
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 14,
  sendCount: 9,
  dayCount: 7,
  hasNotes: 0,
  companions: [],
};
const current: TripSummary = {
  id: 2,
  name: "Spring road trip",
  description: null,
  albumUrl: null,
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  entryCount: 6,
  sendCount: 3,
  dayCount: 4,
  hasNotes: 0,
  companions: [],
};
const upcoming: TripSummary = {
  id: 3,
  name: "Squamish, July 2026",
  description: null,
  albumUrl: null,
  startDate: "2026-07-04",
  endDate: "2026-07-18",
  entryCount: 0,
  sendCount: 0,
  dayCount: 0,
  hasNotes: 0,
  companions: [],
};

beforeEach(() => {
  vi.mocked(deleteTrip).mockReset();
  vi.mocked(deleteTrip).mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(saveTrip).mockReset();
  refresh.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("offers exactly one way to start a trip, wherever the list stands", () => {
  const { rerender } = render(<TripList trips={[]} userId="alex" today={TODAY} canEdit />);
  expect(screen.getAllByRole("button", { name: /new trip/i })).toHaveLength(1);

  rerender(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);
  expect(screen.getAllByRole("button", { name: /new trip/i })).toHaveLength(1);
});

it("centers the button in the empty state", () => {
  const { rerender } = render(<TripList trips={[]} userId="alex" today={TODAY} canEdit />);
  expect(screen.getByRole("button", { name: "New trip" })).not.toHaveClass("self-end");

  rerender(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);
  expect(screen.getByRole("button", { name: "New trip" })).toHaveClass("self-end");
});

it("opens the new trip dialog as a modal on desktop and returns focus", async () => {
  stubViewport("desktop");
  const user = userEvent.setup();
  render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);
  const newTrip = screen.getByRole("button", { name: "New trip" });
  const overlays = watchOverlayKinds();

  await user.click(newTrip);
  const dialog = await screen.findByRole("dialog", { name: "New trip" });
  expect(overlays.seen).toEqual(["modal"]);

  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(newTrip).toHaveFocus());
  overlays.stop();
});

it("starts each new trip with an empty form", async () => {
  const user = userEvent.setup();
  render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);

  await user.click(screen.getByRole("button", { name: "New trip" }));
  await user.type(await screen.findByRole("textbox", { name: /name/i }), "Never mind");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "New trip" }));
  expect(await screen.findByRole("textbox", { name: /name/i })).toHaveValue("");
});

it("shows the empty message only when there are no trips", () => {
  const { rerender } = render(<TripList trips={[]} userId="alex" today={TODAY} canEdit />);
  expect(screen.getByText("No trips yet.")).toBeInTheDocument();

  rerender(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);
  expect(screen.queryByText(/No trips yet/)).not.toBeInTheDocument();
  expect(screen.queryByText(/in one place/)).not.toBeInTheDocument();
});

it("shows each trip's counts and links its name to the trip", () => {
  render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);

  const card = screen.getByRole("listitem");
  expect(within(card).getByRole("link", { name: "Bishop, March 2026" })).toHaveAttribute(
    "href",
    "/users/alex/trips/1",
  );
  expect(card).toHaveTextContent("7 days logged");
  expect(card).toHaveTextContent("14 entries");
  expect(card).toHaveTextContent("9 sends");
});

it("shows another user's trips without create, edit or delete", () => {
  const { rerender } = render(
    <TripList trips={[past]} userId="alex" today={TODAY} canEdit={false} />,
  );

  expect(screen.getByRole("link", { name: "Bishop, March 2026" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  rerender(<TripList trips={[]} userId="alex" today={TODAY} canEdit={false} />);
  expect(screen.getByText("No trips yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("leaves out journal counts when the viewer can't read the journal", () => {
  render(
    <TripList
      trips={[{ ...past, entryCount: null, dayCount: null }]}
      userId="alex"
      today={TODAY}
      canEdit={false}
    />,
  );

  const card = screen.getByRole("listitem");
  expect(card).toHaveTextContent("9 sends");
  expect(card).not.toHaveTextContent("entries");
  expect(card).not.toHaveTextContent("days logged");
});

it("lists tagged friends with links to their profiles", () => {
  const withFriends = {
    ...past,
    companions: [
      { id: "sam", name: "Sam Okafor", image: null, isSelf: false },
      { id: "priya", name: "Priya Nair", image: null, isSelf: false },
    ],
  };
  render(<TripList trips={[withFriends, current]} userId="alex" today={TODAY} canEdit />);

  const [tagged, untagged] = screen.getAllByRole("listitem");
  expect(tagged).toHaveTextContent("With Sam Okafor, Priya Nair");
  expect(within(tagged).getByRole("link", { name: "Sam Okafor" })).toHaveAttribute(
    "href",
    "/users/sam",
  );
  expect(untagged).not.toHaveTextContent("With");
});

it("badges only the trips whose status is worth saying, against the given day", () => {
  render(<TripList trips={[upcoming, current, past]} userId="alex" today={TODAY} canEdit />);

  const [upcomingCard, currentCard, pastCard] = screen.getAllByRole("listitem");
  expect(upcomingCard).toHaveTextContent("Upcoming");
  expect(currentCard).toHaveTextContent("On now");
  expect(pastCard).not.toHaveTextContent("Upcoming");
  expect(pastCard).not.toHaveTextContent("On now");
});

it("says plainly that deleting a trip keeps the climbs, then deletes it", async () => {
  const user = userEvent.setup();
  render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);

  await user.click(screen.getByRole("button", { name: "Actions for Bishop, March 2026" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Delete this trip?");
  expect(dialog).toHaveTextContent(/won't delete any climbs/i);

  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith(1));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("keeps the trip listed and shows the reason when the delete is refused", async () => {
  const user = userEvent.setup();
  vi.mocked(deleteTrip).mockResolvedValue({ ok: false, error: "Trip not found" });
  render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);

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
  let finish!: (result: ActionResult<number>) => void;
  vi.mocked(saveTrip).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender } = render(<TripList trips={[past]} userId="alex" today={TODAY} canEdit />);

  await user.click(screen.getByRole("button", { name: `Actions for ${past.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

  const name = await screen.findByRole("textbox", { name: /name/i });
  await user.clear(name);
  await user.type(name, "Bishop, take two");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalled());

  // The server accepts it, the dialog closes and the list re-renders with the
  // saved trip. The dialog's reset runs EXIT_SETTLE_MS later and reads
  // whichever trip it was last handed — which is how a stale draft survives
  // into the next session. Testing Library's waits drain through a real
  // setTimeout, so the clock is faked only around the close and the reset.
  vi.useFakeTimers();
  await act(async () => finish({ ok: true, value: past.id }));
  const saved = { ...past, name: "Bishop, take two" };
  rerender(<TripList trips={[saved]} userId="alex" today={TODAY} canEdit />);
  await act(() => vi.advanceTimersByTimeAsync(300));
  vi.useRealTimers();

  await user.click(screen.getByRole("button", { name: `Actions for ${saved.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

  expect(await screen.findByRole("textbox", { name: /name/i })).toHaveValue("Bishop, take two");
});

it("adds the share token to trip links for signed-out visitors", () => {
  const token = "0123456789abcdef0123456789abcdef";
  render(
    <TripList
      trips={[{ ...past, entryCount: null, dayCount: null }]}
      userId="alex"
      today={TODAY}
      canEdit={false}
      shareToken={token}
    />,
  );

  expect(screen.getByRole("link", { name: "Bishop, March 2026" })).toHaveAttribute(
    "href",
    `/users/alex/trips/1?share=${token}`,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
