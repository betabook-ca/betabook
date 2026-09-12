import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { updateJournalEntry } from "@/actions";
import { moonSlab } from "@/stories/fixtures/open-projects";

import { JournalEntryEditDrawer } from "./journal-entry-edit-drawer";
vi.mock("@/actions", () => ({
  updateJournalEntry: vi.fn<() => Promise<unknown>>(),
  createJournalEntry: vi.fn<() => Promise<unknown>>(),
  createUndatedSend: vi.fn<() => Promise<unknown>>(),
}));

function Example({ training = false }: { training?: boolean }) {
  const state = useOverlayState({ defaultOpen: true });
  const entry = training
    ? { ...moonSlab.sessions[0], kind: "training" as const, climbId: null, climbType: null }
    : moonSlab.sessions[0];
  return <JournalEntryEditDrawer state={state} entry={entry} />;
}
it.each([false, true])(
  "saves an existing entry through the edit popup (training=%s)",
  async (training) => {
    vi.mocked(updateJournalEntry).mockResolvedValueOnce({ ok: true, value: undefined });
    render(<Example training={training} />);
    const user = userEvent.setup();
    expect(
      screen.getByRole("dialog", { name: training ? "Edit training" : "Edit session" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateJournalEntry).toHaveBeenCalledWith(moonSlab.sessions[0].id, expect.any(FormData));
  },
);
