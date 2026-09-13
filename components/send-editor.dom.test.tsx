import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { getSendEditorData, updateSend } from "@/actions";

import { SendEditor } from "./send-editor";

vi.mock("@/actions", () => ({
  getSendEditorData: vi.fn<typeof getSendEditorData>(),
  updateSend: vi.fn<typeof updateSend>(),
}));
const value = {
  climb: { id: 17, areaId: 3, type: "boulder" as const, grade: 5 },
  send: {
    id: 91,
    ascentStyle: "flash" as const,
    dateSent: "2026-08-30",
    comment: "Original beta",
    rating: 4,
    suggestedGrade: 6,
    gradeFeel: "high" as const,
  },
  entry: {
    id: 42,
    climbId: 17,
    kind: "session" as const,
    sent: true,
    entryDate: "2026-08-30",
    body: "Original beta",
    tags: ["beta"],
    companions: [],
    climbName: "Cedar",
    climbType: "boulder" as const,
    climbGrade: 5,
    areaId: 3,
    areaName: "Forest",
    isAscent: true,
    isSendComment: true,
  },
};

it.each([{ sendId: 91 }, { entryId: 42 }])(
  "loads and saves the same linked editor from %o",
  async (target) => {
    vi.mocked(getSendEditorData).mockResolvedValue({ ok: true, value });
    const save = vi.mocked(updateSend).mockResolvedValue({ ok: true, value: undefined });
    save.mockClear();
    const user = userEvent.setup();
    const onDone = vi.fn<() => void>();
    render(<SendEditor {...target} onDone={onDone} />);
    expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue("Original beta");
    expect(getSendEditorData).toHaveBeenCalledWith(target);
    expect(screen.getByRole("radio", { name: "Flash" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await user.clear(screen.getByRole("textbox", { name: "Notes" }));
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "Updated beta");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toBe(91);
    expect(save.mock.calls[0][1].get("comment")).toBe("Updated beta");
    expect(save.mock.calls[0][1].getAll("tag")).toEqual(["beta"]);
    expect(save.mock.calls[0][1].get("companionsChanged")).toBeNull();
  },
);

it("keeps the form unavailable while loading and retries failed loads", async () => {
  let resolve!: (result: Awaited<ReturnType<typeof getSendEditorData>>) => void;
  vi.mocked(getSendEditorData)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce({ ok: true, value });
  const user = userEvent.setup();
  render(<SendEditor sendId={91} onDone={vi.fn<() => void>()} />);
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  await act(async () => resolve({ ok: false, error: "Please try again" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Please try again");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue("Original beta");
});
