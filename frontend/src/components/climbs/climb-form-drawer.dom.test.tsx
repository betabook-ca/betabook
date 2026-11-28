import { useOverlayState } from "@heroui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { createClimb } from "@/spa/lib/actions-client";
import { stubViewport } from "@/tests/vitest/viewport";

import { ClimbFormDrawer } from "./climb-form-drawer";

vi.mock("@/spa/lib/actions-client", () => ({
  createClimb: vi.fn<typeof createClimb>(),
  updateClimb: vi.fn<() => Promise<ActionResult>>(),
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

function ClimbDrawer() {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbFormDrawer areaId={1} state={state} />;
}

it("keeps the add-climb dialog open while the save is in flight", async () => {
  stubViewport("mobile");
  const save = deferred();
  vi.mocked(createClimb).mockReturnValue(save.promise);
  const user = userEvent.setup();
  render(<ClimbDrawer />);

  const dialog = await screen.findByRole("dialog", { name: "Add climb" });
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Cedar Arete");
  await user.click(screen.getByRole("button", { name: "Add climb" }));
  // The disabled submit drops focus to the body, so Escape goes to the dialog.
  fireEvent.keyDown(dialog, { key: "Escape" });
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(dialog).toBeInTheDocument();

  save.finish(5);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
