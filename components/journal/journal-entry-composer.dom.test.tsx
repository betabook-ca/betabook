import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { createSearchFixtureFetcher } from "@/stories/fixtures/app-search-demo";

import { JournalEntryComposer } from "./journal-entry-composer";

vi.mock("@/actions", () => ({
  createJournalEntry: vi.fn<() => Promise<ActionResult>>(),
  createUndatedSend: vi.fn<() => Promise<ActionResult>>(),
  updateJournalEntry: vi.fn<() => Promise<ActionResult>>(),
}));

type Save = (formData: FormData, undated: boolean) => Promise<ActionResult>;

function Example({ save, onDone }: { save: Save; onDone: () => void }) {
  const [climbFetcher] = useState(() => createSearchFixtureFetcher());
  return <JournalEntryComposer onSave={save} onDone={onDone} climbFetcher={climbFetcher} />;
}

async function chooseClimb(user: ReturnType<typeof userEvent.setup>, result: string) {
  await user.type(await screen.findByRole("searchbox", { name: "Choose a climb" }), "cedar");
  await user.click(await screen.findByRole("button", { name: `Choose ${result}` }));
}

it("Save and add another saves the climb, returns to Choose a climb, and starts the next on the same date and tags", async () => {
  const user = userEvent.setup();
  const save = vi.fn<Save>().mockResolvedValue({ ok: true, value: undefined });
  const onDone = vi.fn<() => void>();
  render(<Example save={save} onDone={onDone} />);

  await user.click(screen.getByRole("button", { name: /^Outdoor session/ }));
  await chooseClimb(user, "Cedar Crack, North Woods / Upper Wall");
  await user.click(screen.getByRole("spinbutton", { name: /month, Date/ }));
  await user.keyboard("09012026");
  await user.click(screen.getByRole("button", { name: "Add details" }));
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "cold{Enter}");
  await user.click(screen.getByRole("button", { name: "Save and add another" }));

  // Saved, and straight back to choosing the next climb rather than closing.
  await chooseClimb(user, "Cedar Corner, North Woods / Cedar Grove");
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].get("climbId")).toBe("102");
  expect(onDone).not.toHaveBeenCalled();

  // The next climb starts where the last one left off, with Add details open.
  expect(screen.getByRole("heading", { name: "Cedar Corner" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add details" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: "Remove tag cold" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save entry" }));

  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  const second = save.mock.calls[1][0];
  expect(second.get("climbId")).toBe("104");
  expect(second.get("entryDate")).toBe("2026-09-01");
  expect(second.getAll("tag")).toEqual(["cold"]);
});
