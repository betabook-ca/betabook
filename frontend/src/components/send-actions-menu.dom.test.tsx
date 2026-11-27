import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { GENERIC_ERROR_MESSAGE, type ActionResult } from "@/lib/action-result";
import type { EditableSend } from "@/lib/logbook-types";
import { deleteSend } from "@/spa/lib/actions-client";

import { SendActionsMenu } from "./send-actions-menu";

vi.mock("@/spa/lib/actions-client", () => ({
  deleteSend: vi.fn<(id: number) => Promise<ActionResult>>(),
}));

const remove = vi.mocked(deleteSend);

const send: EditableSend = {
  id: 91,
  ascentStyle: "redpoint",
  dateSent: "2026-08-30",
  comment: null,
  rating: null,
  suggestedGrade: null,
  gradeFeel: "solid",
  videos: null,
};

beforeEach(() => {
  remove.mockReset();
});

it("keeps the confirmation open and explains a delete that threw", async () => {
  remove.mockRejectedValue(new Error("offline"));
  const user = userEvent.setup();
  render(<SendActionsMenu send={send} />);

  await user.click(screen.getByRole("button", { name: "Send actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(await screen.findByRole("button", { name: "Delete" }));

  expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeVisible();
  expect(remove).toHaveBeenCalledExactlyOnceWith(91);
  await waitFor(() => expect(screen.getByRole("alertdialog")).toBeVisible());
});
