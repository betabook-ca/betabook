import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { removeMyTripTag } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import type { JournalCompanion } from "@/lib/journal-companions";

import { TripCompanions } from "./trip-companions";

vi.mock("@/actions", () => ({ removeMyTripTag: vi.fn<() => Promise<ActionResult>>() }));

const TRIP = 7;
const SAM: JournalCompanion = { id: "sam", name: "Sam Okafor", image: null, isSelf: false };
const ME: JournalCompanion = { id: "priya", name: "Priya Nair", image: null, isSelf: true };

beforeEach(() => {
  vi.mocked(removeMyTripTag).mockReset();
  vi.mocked(removeMyTripTag).mockResolvedValue({ ok: true, value: undefined });
});

it("names the friends on the trip and links each to their profile", () => {
  render(<TripCompanions tripId={TRIP} initialCompanions={[SAM]} />);

  expect(screen.getByRole("link", { name: "Sam Okafor" })).toHaveAttribute("href", "/users/sam");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("lets the tagged friend take themself off, and nobody else", async () => {
  const user = userEvent.setup();
  render(<TripCompanions tripId={TRIP} initialCompanions={[SAM, ME]} />);

  await user.click(screen.getByRole("button", { name: "Remove my tag" }));

  await waitFor(() => expect(removeMyTripTag).toHaveBeenCalledExactlyOnceWith(TRIP));
  await waitFor(() => expect(screen.queryByText("Priya Nair")).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Sam Okafor" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("keeps the tag and says why when the removal is refused", async () => {
  vi.mocked(removeMyTripTag).mockResolvedValue({
    ok: false,
    error: "This tag is no longer available",
  });
  const user = userEvent.setup();
  render(<TripCompanions tripId={TRIP} initialCompanions={[ME]} />);

  await user.click(screen.getByRole("button", { name: "Remove my tag" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("This tag is no longer available");
  expect(screen.getByRole("link", { name: "Priya Nair" })).toBeInTheDocument();
});

it("draws nothing for a trip with nobody tagged", () => {
  const { container } = render(<TripCompanions tripId={TRIP} initialCompanions={[]} />);
  expect(container).toBeEmptyDOMElement();
});
