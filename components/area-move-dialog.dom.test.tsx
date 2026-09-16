import { Button, useOverlayState } from "@heroui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { requestAreaReparent, requestClimbMove } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import type { GatedActionResult } from "@/lib/moderation";

import { AreaReparentDialog } from "./area-reparent-dialog";
import { ClimbMoveDialog } from "./climb-move-dialog";

vi.mock("@/actions", () => ({
  requestAreaReparent: vi.fn<() => Promise<ActionResult<GatedActionResult>>>(),
  requestClimbMove: vi.fn<() => Promise<ActionResult<GatedActionResult>>>(),
}));
vi.mock("@/lib/search-suggestions", () => ({
  fetchAreaSuggestions: async () => [{ id: 20, name: "Target", ancestorPath: "Region" }],
}));

beforeEach(() => {
  vi.mocked(requestAreaReparent).mockReset();
  vi.mocked(requestClimbMove).mockReset();
});

function Example({ kind }: { kind: "area" | "climb" }) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <>
      <Button onPress={state.open}>Open move</Button>
      {kind === "area" ? (
        <AreaReparentDialog areaId={10} state={state} />
      ) : (
        <ClimbMoveDialog climbId={11} state={state} />
      )}
    </>
  );
}

async function chooseTarget(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox", { name: "Area" }), "Target");
  await user.click(await screen.findByRole("option", { name: /Target/ }));
}

it.each(["area", "climb"] as const)(
  "resets the %s move after acknowledging a queued request",
  async (kind) => {
    const action = vi.mocked(kind === "area" ? requestAreaReparent : requestClimbMove);
    action.mockResolvedValue({ ok: true, value: { status: "pending" } });
    const user = userEvent.setup();
    render(<Example kind={kind} />);
    await chooseTarget(user);
    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(action).toHaveBeenCalledWith(kind === "area" ? 10 : 11, 20);
    expect(await screen.findByRole("heading", { name: "Submitted for review" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Open move" }));
    expect(screen.queryByRole("heading", { name: "Submitted for review" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Area" })).toHaveValue("");
  },
);
