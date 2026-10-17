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
  name: "Test Highball",
  type: "boulder",
  grade: 5,
  description: null,
  brokenOn: null,
  sendCount: 0,
  ratingSum: 0,
  ratingCount: 0,
  avgRating: null,
};
function Editor({ grade }: { grade: number | null }) {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbEditRequestDrawer climb={{ ...climb, grade }} state={state} />;
}

it("offers only real grades, so a legacy ungraded climb proposes the lowest one", () => {
  render(<Editor grade={null} />);
  expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent("VB");
});

it.each([{ grade: 5, label: "V4", submittedGrade: "5" }])(
  "restores $label when returning to the climb's original discipline",
  async ({ grade, label, submittedGrade }) => {
    const request = vi.mocked(requestClimbEdit).mockReset();
    request.mockResolvedValue({ ok: true, value: { status: "pending" } });
    const user = userEvent.setup();
    render(<Editor grade={grade} />);
    const discipline = screen.getByRole("combobox", { name: "Discipline" });
    await user.selectOptions(discipline, "sport");
    await user.selectOptions(discipline, "boulder");
    expect(screen.getByRole("button", { name: /Grade$/ })).toHaveTextContent(label);
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Renamed climb");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.calls[0][1].get("type")).toBe("boulder");
    expect(request.mock.calls[0][1].get("grade")).toBe(submittedGrade);
  },
);
