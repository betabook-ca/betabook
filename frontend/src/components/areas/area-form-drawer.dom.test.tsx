import { useOverlayState } from "@heroui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { createArea } from "@/spa/lib/actions-client";
import { stubViewport } from "@/tests/vitest/viewport";

import { AreaFormDrawer } from "./area-form-drawer";

vi.mock("@/spa/lib/actions-client", () => ({
  createArea: vi.fn<typeof createArea>(),
  updateArea: vi.fn<() => Promise<ActionResult>>(),
}));
vi.mock("@/spa/lib/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn<() => void>(), push: vi.fn<(href: string) => void>() }),
}));

function deferred() {
  let finish: (result: ActionResult<number>) => void = () => {};
  const promise = new Promise<ActionResult<number>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (value: number) => finish({ ok: true, value }) };
}

function AreaDrawer() {
  const state = useOverlayState({ defaultOpen: true });
  return <AreaFormDrawer parentId={1} state={state} />;
}

it("keeps the add-area dialog open while the save is in flight", async () => {
  stubViewport("mobile");
  const save = deferred();
  vi.mocked(createArea).mockReturnValue(save.promise);
  const user = userEvent.setup();
  render(<AreaDrawer />);

  const dialog = await screen.findByRole("dialog", { name: "Add area" });
  await user.type(screen.getByRole("textbox", { name: "Name" }), "North Woods");
  await user.click(screen.getByRole("button", { name: "Add area" }));
  // The disabled submit drops focus to the body, so Escape goes to the dialog.
  fireEvent.keyDown(dialog, { key: "Escape" });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(dialog).toBeInTheDocument();

  save.finish(7);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
