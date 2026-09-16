import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { requestClimbEdit } from "@/actions";
import type { Climb } from "@/db/queries";

import { ClimbEditRequestDrawer } from "./climb-edit-request-drawer";

vi.mock("@/actions", () => ({ requestClimbEdit: vi.fn<typeof requestClimbEdit>() }));
const climb: Climb = {
  id: 1,
  areaId: 1,
  name: "Ungraded",
  type: "boulder",
  grade: null,
  description: null,
  sendCount: 0,
  ratingSum: 0,
  ratingCount: 0,
  avgRating: null,
};
function Editor() {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbEditRequestDrawer climb={climb} state={state} />;
}
it("renames an ungraded climb without proposing the lowest grade", async () => {
  vi.mocked(requestClimbEdit).mockResolvedValue({ ok: true, value: { status: "pending" } });
  const user = userEvent.setup();
  render(<Editor />);
  expect(screen.getByRole("combobox", { name: "Discipline" })).toHaveValue("boulder");
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent("Unknown");
  await user.clear(screen.getByRole("textbox", { name: "Name" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "New name");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(requestClimbEdit).toHaveBeenCalledOnce());
  expect(vi.mocked(requestClimbEdit).mock.calls[0][1].get("grade")).toBe("");
});
