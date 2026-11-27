import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { JournalEntry } from "@/lib/logbook-types";

import { ClimbJournalCard } from "./climb-journal-card";

vi.mock("@/spa/lib/actions-client", () => ({
  deleteJournalEntry: vi.fn<() => Promise<unknown>>(),
}));

const entry = (id: number, entryDate: string, body: string): JournalEntry => ({
  reportedGrade: null,
  videos: null,
  companions: [],
  id,
  climbId: 2,
  kind: "session",
  sent: false,
  entryDate,
  body,
  tags: [],
  climbName: "Cedar Arete",
  climbType: "boulder",
  climbGrade: 4,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Granite Canyon",
  isAscent: false,
  isSendComment: false,
});

// Journal rows elsewhere hide their menu behind a long press on touch
// screens; the climb page a row links to keeps a visible way to edit.
it("offers Edit and Delete on each of the viewer's entries", async () => {
  const user = userEvent.setup();
  render(
    <ClimbJournalCard
      userId="owner"
      climbId={2}
      entries={[
        entry(1, "2026-09-04", "Linked the crux."),
        entry(2, "2026-08-30", "Fell at the lip."),
      ]}
    />,
  );

  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(2);
  for (const item of items) {
    expect(within(item).getByRole("button", { name: "Entry actions" })).toBeVisible();
  }

  await user.click(within(items[1]).getByRole("button", { name: "Entry actions" }));
  expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});
