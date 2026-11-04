import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { localToday } from "@/lib/format-date";
import { readDayEntries } from "@/lib/journal-day";

import { JournalEntryDrawer } from "./journal-entry-drawer";

vi.mock("@/actions", () => ({
  createDayEntries: vi.fn<() => Promise<ActionResult>>(),
  createJournalEntry: vi.fn<() => Promise<ActionResult>>(),
  createUndatedSend: vi.fn<() => Promise<ActionResult>>(),
  updateJournalEntry: vi.fn<() => Promise<ActionResult>>(),
}));

const climb = { id: 17, areaId: 3, name: "Cedar Arete", type: "boulder" as const, grade: 5 };

it("offers only Outdoor session and Training", async () => {
  render(<Example save={vi.fn<(data: FormData, undated: boolean) => Promise<ActionResult>>()} />);
  expect(await screen.findByRole("button", { name: /^Outdoor session/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Training/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Climbing day/ })).not.toBeInTheDocument();
});

it("turns an outdoor session into a day with Log additional climbs, saved as one day", async () => {
  const user = userEvent.setup();
  const save = vi.fn<(data: FormData, undated: boolean) => Promise<ActionResult>>();
  const saveDay = vi.fn<(data: FormData) => Promise<ActionResult>>().mockResolvedValue({
    ok: true,
    value: undefined,
  });
  function ClimbExample() {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <JournalEntryDrawer
        state={state}
        climb={{ ...climb, brokenOn: null }}
        onSave={save}
        onSaveDay={saveDay}
      />
    );
  }
  render(<ClimbExample />);

  await user.click(await screen.findByRole("radio", { name: "Redpoint" }));
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Sent it.");
  await user.click(screen.getByRole("button", { name: "Log additional climbs" }));

  // The day's setup shows first, so friends and tags can be adjusted before
  // Add climb. The button that opened it is gone, so focus is on its title.
  const heading = await screen.findByRole("heading", { name: "Log a day" });
  expect(screen.queryByRole("dialog", { name: "Add a climb" })).not.toBeInTheDocument();
  expect(heading.parentElement).toHaveFocus();

  // Add climb still opens the picker, and closing it lands back on Add climb.
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  const picker = await screen.findByRole("dialog", { name: "Add a climb" });
  await user.click(within(picker).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(picker).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("button", { name: "Add climb" })).toHaveFocus());
  expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  const line = screen.getByRole("listitem", { name: "Cedar Arete" });
  expect(within(line).getByText("Redpoint")).toBeInTheDocument();
  expect(within(line).getByText("Sent it.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save 1 entry" }));
  expect(save).not.toHaveBeenCalled();
  expect(saveDay).toHaveBeenCalledOnce();
  const { shared, entries } = readDayEntries(saveDay.mock.calls[0][0]);
  expect(shared.get("entryDate")).toBe(localToday());
  expect(Object.fromEntries(entries[0].entries())).toMatchObject({
    climbId: "17",
    sent: "true",
    body: "Sent it.",
    ascentStyle: "redpoint",
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Log entry" })).not.toBeInTheDocument(),
  );
});
function Example({ save }: { save: (data: FormData, undated: boolean) => Promise<ActionResult> }) {
  const state = useOverlayState({ defaultOpen: true });
  return <JournalEntryDrawer state={state} onSave={save} />;
}
it("keeps the popup open while saving and closes after the entry is saved", async () => {
  const user = userEvent.setup();
  let finish: (result: ActionResult) => void = () => {};
  const save = vi.fn<(data: FormData, undated: boolean) => Promise<ActionResult>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Example save={save} />);
  await user.click(await screen.findByRole("button", { name: /^Training/ }));
  await user.click(screen.getByRole("button", { name: "Save entry" }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].get("kind")).toBe("training");
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Log entry" })).toBeInTheDocument();
  finish({ ok: true, value: undefined });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Log entry" })).not.toBeInTheDocument(),
  );
});
