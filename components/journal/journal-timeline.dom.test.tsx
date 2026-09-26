import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { JournalEntry } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";

import { JournalTimeline } from "./journal-timeline";

vi.mock("@/actions", () => ({
  deleteJournalEntry: vi.fn<() => Promise<unknown>>(),
  removeMyJournalTag: vi.fn<() => Promise<unknown>>(),
}));

function entry(id: number, entryDate: string): JournalEntry {
  return {
    id,
    climbId: null,
    kind: "training",
    sent: false,
    entryDate,
    body: null,
    tags: [],
    climbName: null,
    climbType: null,
    climbGrade: null,
    climbBrokenOn: null,
    areaId: null,
    areaName: null,
    isAscent: false,
    isSendComment: false,
  };
}

function timeline(props: Partial<Parameters<typeof JournalTimeline>[0]> = {}) {
  return (
    <JournalTimeline
      userId="owner"
      filter={DEFAULT_JOURNAL_FILTER}
      initialEntries={[]}
      initialHasMore={false}
      initialAreaBreadcrumbs={{}}
      isOwner
      hasAnyEntries={false}
      {...props}
    />
  );
}

it("invites the owner to log or import when the journal is empty", () => {
  render(timeline());
  expect(screen.getByText("No entries yet.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Log" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Import your sends" })).toHaveAttribute(
    "href",
    "/account/import",
  );
});

it("shows a visitor the empty journal without an invitation", () => {
  render(timeline({ isOwner: false }));
  expect(screen.getByText("No entries yet.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Import your sends" })).not.toBeInTheDocument();
});

it("keeps the invitation out of a filtered-empty journal", () => {
  render(timeline({ hasAnyEntries: true }));
  expect(screen.getByText("No entries match these filters.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Log" })).not.toBeInTheDocument();
});

it("renders the entries as a list of items under level-3 month headings", () => {
  render(
    timeline({
      isOwner: false,
      hasAnyEntries: true,
      initialEntries: [entry(2, "2026-09-04"), entry(1, "2026-08-20")],
    }),
  );
  const rows = within(screen.getByRole("list")).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual(["September 2026", "August 2026"]);
});
