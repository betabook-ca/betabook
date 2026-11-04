import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";

import { JournalEntryDrawer } from "./journal-entry-drawer";

vi.mock("@/actions", () => ({
  createJournalEntry: vi.fn<() => Promise<ActionResult>>(),
  createUndatedSend: vi.fn<() => Promise<ActionResult>>(),
  updateJournalEntry: vi.fn<() => Promise<ActionResult>>(),
}));
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

it("on a climb page, Save and add another saves that climb and moves on to Choose a climb", async () => {
  const user = userEvent.setup();
  const save = vi
    .fn<(data: FormData, undated: boolean) => Promise<ActionResult>>()
    .mockResolvedValue({ ok: true, value: undefined });
  function ClimbExample() {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <JournalEntryDrawer
        state={state}
        climb={{
          id: 17,
          areaId: 3,
          name: "Cedar Arete",
          type: "boulder",
          grade: 5,
          brokenOn: null,
        }}
        onSave={save}
      />
    );
  }
  render(<ClimbExample />);

  await user.click(await screen.findByRole("radio", { name: "Redpoint" }));
  await user.click(screen.getByRole("button", { name: "Save and add another" }));

  expect(await screen.findByRole("searchbox", { name: "Choose a climb" })).toBeInTheDocument();
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0].get("climbId")).toBe("17");
  expect(screen.getByRole("dialog", { name: "Log entry" })).toBeInTheDocument();
});
