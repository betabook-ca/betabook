import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { deleteTrip, saveTrip } from "@/actions";
import type { TripSummary } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { TripActions } from "./trip-actions";

vi.mock("@/actions", () => ({
  deleteTrip: vi.fn<() => Promise<ActionResult>>(),
  saveTrip: vi.fn<() => Promise<ActionResult<number>>>(),
}));

const push = vi.fn<(href: string) => void>();
const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop, March 2026",
  description: "Buttermilks.",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 14,
  sendCount: 9,
  dayCount: 7,
  hasNotes: 0,
  companions: [],
};

beforeEach(() => {
  vi.mocked(deleteTrip).mockReset();
  vi.mocked(deleteTrip).mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(saveTrip).mockReset();
  vi.mocked(saveTrip).mockResolvedValue({ ok: true, value: 7 });
  push.mockReset();
  refresh.mockReset();
});

async function choose(user: ReturnType<typeof userEvent.setup>, item: "Edit" | "Delete") {
  await user.click(screen.getByRole("button", { name: "Actions for Bishop, March 2026" }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

it("opens the trip it belongs to for editing, and saves in place", async () => {
  const user = userEvent.setup();
  render(<TripActions trip={BISHOP} userId="alex" />);

  await choose(user, "Edit");
  // Named for the kind of record, as every other edit dialog is.
  expect(await screen.findByRole("dialog", { name: "Edit trip" })).toBeInTheDocument();
  const name = await screen.findByRole("textbox", { name: /name/i });
  expect(name).toHaveValue("Bishop, March 2026");

  await user.clear(name);
  await user.type(name, "Bishop");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(saveTrip).toHaveBeenCalledExactlyOnceWith(
      7,
      expect.objectContaining({ name: "Bishop" }),
    ),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
});

it("stays on the list after deleting a trip from it", async () => {
  const user = userEvent.setup();
  render(<TripActions trip={BISHOP} userId="alex" />);

  await choose(user, "Delete");
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(deleteTrip).toHaveBeenCalledExactlyOnceWith(7));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
});

it("leaves for the trips list after deleting the trip whose page this is", async () => {
  const user = userEvent.setup();
  render(<TripActions trip={BISHOP} userId="alex" leaveOnDelete />);

  await choose(user, "Delete");
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByRole("heading", { name: "Delete this trip?" })).toBeVisible();
  expect(dialog).toHaveTextContent(/won't delete any climbs/i);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/users/alex/trips"));
  expect(refresh).not.toHaveBeenCalled();
});

it("stays where it is and says why when the delete is refused", async () => {
  vi.mocked(deleteTrip).mockResolvedValue({ ok: false, error: "Trip not found" });
  const user = userEvent.setup();
  render(<TripActions trip={BISHOP} userId="alex" leaveOnDelete />);

  await choose(user, "Delete");
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));

  expect(await within(dialog).findByText("Trip not found")).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});
