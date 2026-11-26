import { useOverlayState } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

function Example({ onClose }: { onClose: () => void }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <ConfirmDeleteDialog
      state={state}
      noun="climb"
      onConfirm={vi.fn<() => void>()}
      isPending={false}
      onClose={onClose}
    >
      <p>Reason field</p>
    </ConfirmDeleteDialog>
  );
}

it("passes the extra confirmation props through", async () => {
  const onClose = vi.fn<() => void>();
  render(<Example onClose={onClose} />);
  const dialog = screen.getByRole("alertdialog", { name: "Delete this climb?" });
  expect(dialog).toHaveTextContent("Reason field");
  await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
  expect(onClose).toHaveBeenCalledOnce();
});
