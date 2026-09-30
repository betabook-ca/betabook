import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { saveTrip } from "@/actions";
import type { TripSummary } from "@/db/queries";
import type { LookupFetcher } from "@/hooks/use-search-lookup";
import type { ActionResult } from "@/lib/action-result";
import type { CompanionOption } from "@/lib/journal-companions";

import { TripDialog } from "./trip-dialog";

vi.mock("@/actions", () => ({ saveTrip: vi.fn<() => Promise<ActionResult<number>>>() }));

const push = vi.fn<(href: string) => void>();
const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const SAM = { id: "sam", name: "Sam Okafor", image: null };
const PRIYA = { id: "priya", name: "Priya Nair", image: null };

const BISHOP: TripSummary = {
  id: 7,
  name: "Bishop",
  description: "Buttermilks",
  albumUrl: null,
  startDate: "2026-03-10",
  endDate: "2026-03-20",
  entryCount: 0,
  sendCount: 0,
  dayCount: 0,
  hasNotes: 0,
  companions: [],
};

const friends = vi.fn<LookupFetcher<CompanionOption>>();

function Example({ trip }: { trip?: TripSummary } = {}) {
  const state = useOverlayState({ defaultOpen: true });
  return <TripDialog state={state} userId="alex" trip={trip} companionFetcher={friends} />;
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
  friends.mockReset();
  friends.mockResolvedValue([SAM, PRIYA]);
  push.mockReset();
  refresh.mockReset();
});

it("starts a new trip on today and keeps the primary action disabled until it has a name", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 29, 12) });
  try {
    const user = userEvent.setup();
    render(<Example />);

    for (const label of ["Start date", "End date"]) {
      expect(
        screen.getByRole("spinbutton", { name: new RegExp(`month, ${label}`) }),
      ).toHaveAttribute("aria-valuenow", "9");
      expect(screen.getByRole("spinbutton", { name: new RegExp(`day, ${label}`) })).toHaveAttribute(
        "aria-valuenow",
        "29",
      );
      expect(
        screen.getByRole("spinbutton", { name: new RegExp(`year, ${label}`) }),
      ).toHaveAttribute("aria-valuenow", "2026");
    }

    const create = screen.getByRole("button", { name: "Create trip" });
    expect(create).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
    expect(create).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
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
    albumUrl: "",
    startDate: "2026-03-10",
    endDate: "2026-03-20",
    companions: [],
  });
  await waitFor(() => expect(push).toHaveBeenCalledWith("/users/alex/trips/7"));
});

it("takes a one-line description and explains who can see it", async () => {
  const user = userEvent.setup();
  render(<Example />);

  const description = screen.getByRole("textbox", { name: /description/i });
  expect(description.tagName).toBe("INPUT");
  expect(description).toHaveAttribute("maxlength", "160");

  await user.click(screen.getByRole("button", { name: "About the description" }));
  const hint = await screen.findByText(/Anyone who can see your sends can see this/);
  expect(hint).toHaveTextContent(
    /^Anyone who can see your sends can see this, including people with your profile link\.$/,
  );
});

it("shows a multi-line description as one line", () => {
  render(<Example trip={{ ...BISHOP, description: "Buttermilks.\n\nTwo rest days.  " }} />);

  // A text input removes line breaks without adding a space, which joins the
  // words.
  expect(screen.getByRole("textbox", { name: /description/i })).toHaveValue(
    "Buttermilks. Two rest days.",
  );
});

it("sends the album link with the trip", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
  await user.type(
    screen.getByRole("textbox", { name: "Google Photos album" }),
    "https://photos.app.goo.gl/Example1Album2Link3",
  );
  await user.click(screen.getByRole("button", { name: "Create trip" }));

  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveTrip).mock.calls[0][1]).toMatchObject({
    albumUrl: "https://photos.app.goo.gl/Example1Album2Link3",
  });
});

it("opens an edit with the trip's album and explains who can see the photos", async () => {
  const user = userEvent.setup();
  const album = "https://photos.app.goo.gl/Example1Album2Link3";
  render(<Example trip={{ ...BISHOP, albumUrl: album }} />);

  expect(screen.getByRole("textbox", { name: "Google Photos album" })).toHaveValue(album);

  await user.click(screen.getByRole("button", { name: "About the album" }));
  expect(
    await screen.findByText(/Anyone who can see your sends can see these photos/),
  ).toBeInTheDocument();
});

it("sends the selected friends for a new trip", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.type(screen.getByRole("textbox", { name: /name/i }), "Bishop");
  await user.type(screen.getByRole("combobox", { name: /friend/i }), "S");
  await user.click(await screen.findByRole("option", { name: /Sam Okafor/ }));
  await user.click(screen.getByRole("button", { name: "Create trip" }));

  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(saveTrip).toHaveBeenCalledWith(null, expect.objectContaining({ companions: ["sam"] }));
});

it("opens an edit with the tagged friends and sends them only if changed", async () => {
  const user = userEvent.setup();
  const tagged = { ...BISHOP, companions: [{ ...SAM, isSelf: false }] };
  render(<Example trip={tagged} />);

  expect(screen.getByRole("button", { name: "Remove friend Sam Okafor" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  // No companions are sent, so tags this user can't see aren't replaced.
  expect(vi.mocked(saveTrip).mock.calls[0][1]).not.toHaveProperty("companions");
});

it("sends the edited selection", async () => {
  const user = userEvent.setup();
  const tagged = { ...BISHOP, companions: [{ ...SAM, isSelf: false }] };
  render(<Example trip={tagged} />);

  await user.click(screen.getByRole("button", { name: "Remove friend Sam Okafor" }));
  await user.type(screen.getByRole("combobox", { name: /friend/i }), "P");
  await user.click(await screen.findByRole("option", { name: /Priya Nair/ }));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => expect(saveTrip).toHaveBeenCalledTimes(1));
  expect(saveTrip).toHaveBeenCalledWith(7, expect.objectContaining({ companions: ["priya"] }));
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
    albumUrl: "",
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
