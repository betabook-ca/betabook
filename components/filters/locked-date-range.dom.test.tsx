import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { DEFAULT_USER_SENDS_FILTER } from "@/lib/filters/user-sends-filter";

import { JournalFilterToolbar } from "./journal-filter-toolbar";
import { UserSendsFilterToolbar } from "./sends-filter-toolbar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn<(href: string) => void>(),
    push: vi.fn<(href: string) => void>(),
  }),
  usePathname: () => "/users/sample/trips/1",
  useSearchParams: () => new URLSearchParams(),
}));

/** A trip's dates are what the climber is looking at, not a filter they chose.
 * Both toolbars therefore have to drop the Dates control *and* the removable
 * chip — leaving either one would let someone clear a trip's window from
 * inside the trip and be shown their whole logbook under its name. */
const TRIP_WINDOW = { dateFrom: "2026-03-10", dateTo: "2026-03-20" };

/** The removable chip and the Dates control are separate affordances and both
 * have to go: the chip alone would still clear the window in one click. */
const REMOVE_CHIP = /^Remove Dates:/;
const DATES_CONTROL = /dates$/i;

describe("the sends toolbar inside a trip", () => {
  const filter = { ...DEFAULT_USER_SENDS_FILTER, ...TRIP_WINDOW };

  it("offers no way to change or clear the window", async () => {
    const user = userEvent.setup();
    render(
      <UserSendsFilterToolbar
        filter={filter}
        basePath="/users/sample/trips/1/sends"
        lockedDateRange
      />,
    );

    expect(screen.queryByRole("button", { name: REMOVE_CHIP })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(screen.queryByRole("button", { name: DATES_CONTROL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: REMOVE_CHIP })).not.toBeInTheDocument();
  });

  it("still offers every filter that is genuinely the reader's to choose", async () => {
    const user = userEvent.setup();
    render(
      <UserSendsFilterToolbar
        filter={filter}
        basePath="/users/sample/trips/1/sends"
        lockedDateRange
      />,
    );

    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(screen.getByRole("button", { name: "Boulder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flash" })).toBeInTheDocument();
  });

  it("shows the Dates control again when the range is the reader's own filter", async () => {
    const user = userEvent.setup();
    render(<UserSendsFilterToolbar filter={filter} basePath="/users/sample/sends" />);

    // Both come back, which is what makes their absence above a real removal
    // rather than a control this harness simply never renders.
    expect(screen.getByRole("button", { name: REMOVE_CHIP })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(screen.getByRole("button", { name: DATES_CONTROL })).toBeInTheDocument();
  });
});

describe("the journal toolbar inside a trip", () => {
  const filter = { ...DEFAULT_JOURNAL_FILTER, ...TRIP_WINDOW };

  it("offers no way to change or clear the window", async () => {
    const user = userEvent.setup();
    render(
      <JournalFilterToolbar
        userId="sample"
        filter={filter}
        climbName={null}
        tags={[]}
        basePath="/users/sample/trips/1"
        lockedDateRange
      />,
    );

    expect(screen.queryByRole("button", { name: REMOVE_CHIP })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(screen.queryByRole("button", { name: DATES_CONTROL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: REMOVE_CHIP })).not.toBeInTheDocument();
  });

  it("shows the Dates control again on the climber's own journal", async () => {
    const user = userEvent.setup();
    render(<JournalFilterToolbar userId="sample" filter={filter} climbName={null} tags={[]} />);

    expect(screen.getByRole("button", { name: REMOVE_CHIP })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(screen.getByRole("button", { name: DATES_CONTROL })).toBeInTheDocument();
  });
});
