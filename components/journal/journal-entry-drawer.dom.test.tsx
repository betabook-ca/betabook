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
