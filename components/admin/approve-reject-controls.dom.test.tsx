import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { rejectChangeRequest } from "@/actions";

import { ApproveRejectControls } from "./approve-reject-controls";

vi.mock("@/actions", () => ({
  approveChangeRequest: vi.fn<typeof import("@/actions").approveChangeRequest>(),
  rejectChangeRequest: vi.fn<typeof rejectChangeRequest>(),
}));

it.each(["rejected", "offline"])(
  "keeps a %s rejection and its note in the dialog, then allows retry",
  async (failure) => {
    const reject = vi.mocked(rejectChangeRequest).mockReset();
    if (failure === "offline") reject.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    else reject.mockResolvedValueOnce({ ok: false, error: "Review permission changed" });
    reject.mockResolvedValueOnce({ ok: true, value: undefined });
    const user = userEvent.setup();
    render(<ApproveRejectControls requestId={1} alreadyApproved={false} />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Keep the original name");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      failure === "offline" ? "Something went wrong" : "Review permission changed",
    );
    expect(within(dialog).getByRole("textbox")).toHaveValue("Keep the original name");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(rejectChangeRequest).toHaveBeenNthCalledWith(2, 1, "Keep the original name");
  },
);

it("clears a failed rejection when canceled and starts the next rejection with an empty reason", async () => {
  const reject = vi.mocked(rejectChangeRequest).mockReset();
  reject.mockResolvedValueOnce({ ok: false, error: "Review permission changed" });
  reject.mockResolvedValueOnce({ ok: true, value: undefined });
  const user = userEvent.setup();
  render(<ApproveRejectControls requestId={1} alreadyApproved={false} />);
  await user.click(screen.getByRole("button", { name: "Reject" }));
  const dialog = screen.getByRole("alertdialog");
  await user.type(within(dialog).getByRole("textbox"), "Discard this reason");
  await user.click(within(dialog).getByRole("button", { name: "Reject" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Review permission changed");

  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reject" }));
  const reopened = screen.getByRole("alertdialog");
  expect(within(reopened).getByRole("textbox")).toHaveValue("");
  expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
  await user.click(within(reopened).getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(reject).toHaveBeenNthCalledWith(2, 1, ""));
});
