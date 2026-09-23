import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { saveTrip } from "@/actions";
import type { Trip } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";

import { TripDialog } from "./trip-dialog";

vi.mock("@/actions", () => ({ saveTrip: vi.fn<() => Promise<ActionResult<number>>>() }));

const push = vi.fn<(href: string) => void>();
const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const BISHOP: Trip = {
  id: 7,
  name: "Bishop",
  description: "Buttermilks",
  startDate: "2026-03-10",
  endDate: "2026-03-20",
};

function Example({ trip }: { trip?: Trip } = {}) {
  const state = useOverlayState({ defaultOpen: true });
  return <TripDialog state={state} userId="alex" trip={trip} />;
}

/** The date pickers are segmented fields: each part is its own spinbutton,
 * named "<part>, <field label>". Focusing the month and typing straight
 * through advances to day and year the way a climber's own keystrokes do. */
async function typeDate(user: ReturnType<typeof userEvent.setup>, label: string, iso: string) {
  const [year, month, day] = iso.split("-");
  await user.click(screen.getByRole("spinbutton", { name: new RegExp(`month, ${label}`) }));
  await user.keyboard(`${month}${day}${year}`);
}

beforeEach(() => {
  vi.mocked(saveTrip).mockReset();
  vi.mocked(saveTrip).mockResolvedValue({ ok: true, value: 7 });
  push.mockReset();
  refresh.mockReset();
});

it("keeps the primary action disabled until the trip has a name and both dates", async () => {
  const user = userEvent.setup();
  render(<Example />);

  const create = screen.getByRole("button", { name: "Create trip" });
  expect(create).toBeDisabled();

  await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
  expect(create).toBeDisabled();

  await typeDate(user, "Start date", "2026-03-10");
  expect(create).toBeDisabled();

  await typeDate(user, "End date", "2026-03-20");
  expect(create).toBeEnabled();
});

it("sends what was typed, then opens the trip it just created", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
  await user.type(screen.getByRole("textbox", { name: /description/i }), "Buttermilks");
  await typeDate(user, "Start date", "2026-03-10");
  await typeDate(user, "End date", "2026-03-20");
  await user.click(screen.getByRole("button", { name: "Create trip" }));

  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(saveTrip).toHaveBeenCalledWith(null, {
    name: "Bishop",
    description: "Buttermilks",
    startDate: "2026-03-10",
    endDate: "2026-03-20",
  });
  await waitFor(() => expect(push).toHaveBeenCalledWith("/users/alex/trips/7"));
});

it("refuses a backwards range before asking the server, and says why", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
  await typeDate(user, "Start date", "2026-03-20");
  await typeDate(user, "End date", "2026-03-10");

  expect(screen.getByText("End date must be on or after start date.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create trip" })).toBeDisabled();
  expect(saveTrip).not.toHaveBeenCalled();
});

it("edits an existing trip in place rather than navigating away", async () => {
  const user = userEvent.setup();
  render(<Example trip={BISHOP} />);

  const name = screen.getByRole("textbox", { name: /name/i });
  expect(name).toHaveValue("Bishop");

  await user.clear(name);
  await user.type(name, "Bishop, take two");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(saveTrip).toHaveBeenCalledWith(7, {
    name: "Bishop, take two",
    description: "Buttermilks",
    startDate: "2026-03-10",
    endDate: "2026-03-20",
  });
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(push).not.toHaveBeenCalled();
});

it("stays open and shows the server's own message when the save is refused", async () => {
  const user = userEvent.setup();
  vi.mocked(saveTrip).mockResolvedValue({ ok: false, error: "Trip not found" });
  render(<Example trip={BISHOP} />);

  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByText("Trip not found")).toBeInTheDocument();
  // The typed trip is still there to correct, not thrown away.
  expect(screen.getByRole("textbox", { name: /name/i })).toHaveValue("Bishop");
  expect(push).not.toHaveBeenCalled();
});
