import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { createArea } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { AreaForm } from "./area-form";

vi.mock("@/actions", () => ({
  createArea: vi.fn<(parentId: number, formData: FormData) => Promise<ActionResult<number>>>(),
  updateArea: vi.fn<(id: number, formData: FormData) => Promise<ActionResult>>(),
}));

it("locks every field while the save is in flight", async () => {
  let finish: (result: ActionResult<number>) => void = () => {};
  vi.mocked(createArea).mockReturnValue(
    new Promise<ActionResult<number>>((resolve) => {
      finish = resolve;
    }),
  );
  const onDone = vi.fn<(areaId: number, areaName: string) => void>();
  const user = userEvent.setup();
  render(<AreaForm parentId={1} onDone={onDone} />);
  await user.type(screen.getByRole("textbox", { name: "Name" }), "North Woods");
  await user.click(screen.getByRole("button", { name: "Add area" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Description" })).toBeDisabled();
  finish({ ok: true, value: 7 });
  await waitFor(() => expect(onDone).toHaveBeenCalledWith(7, "North Woods"));
  expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();
});
