import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { copyClimbList, createClimbList, updateClimbList } from "@/actions";
import type { ActionResult } from "@/lib/action-result";

import { ClimbListDialog, type ClimbListDialogMode } from "./climb-list-dialog";

vi.mock("@/actions", () => ({
  createClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
  updateClimbList: vi.fn<() => Promise<ActionResult>>(),
  copyClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
}));

const push = vi.fn<(href: string) => void>();
const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const CLASSICS = {
  id: 4,
  title: "Red River classics",
  description: "Moderates worth the drive",
  climbCount: 3,
};

function Example({ mode }: { mode: ClimbListDialogMode }) {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbListDialog state={state} userId="alex" mode={mode} />;
}

beforeEach(() => {
  vi.mocked(createClimbList).mockReset().mockResolvedValue({ ok: true, value: 9 });
  vi.mocked(updateClimbList).mockReset().mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(copyClimbList).mockReset().mockResolvedValue({ ok: true, value: 12 });
  push.mockReset();
  refresh.mockReset();
});

it("keeps Create list disabled until the list has a name, then opens the new list", async () => {
  const user = userEvent.setup();
  render(<Example mode={{ kind: "create" }} />);

  const create = screen.getByRole("button", { name: "Create list" });
  expect(create).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: /Name/ }), "Winter circuit");
  await user.click(create);

  await waitFor(() =>
    expect(createClimbList).toHaveBeenCalledWith(
      { title: "Winter circuit", description: "" },
      { climbId: undefined },
    ),
  );
  expect(push).toHaveBeenCalledWith("/users/alex/lists/9");
});

it("pre-fills a copy of your own list with the name marked (copy) and the description", () => {
  render(<Example mode={{ kind: "copy", list: CLASSICS, own: true, source: { listId: 4 } }} />);

  expect(screen.getByRole("textbox", { name: /Name/ })).toHaveValue("Red River classics (copy)");
  expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue(
    "Moderates worth the drive",
  );
  expect(screen.getByText("Copies 3 climbs in list order into your lists.")).toBeInTheDocument();
});

it("pre-fills a copy of someone else's list with their exact name", () => {
  render(<Example mode={{ kind: "copy", list: CLASSICS, own: false, source: { listId: 4 } }} />);
  expect(screen.getByRole("textbox", { name: /Name/ })).toHaveValue("Red River classics");
});

it("submits the edited name and description, through the link when there is one", async () => {
  const user = userEvent.setup();
  render(
    <Example
      mode={{ kind: "copy", list: CLASSICS, own: false, source: { token: "a".repeat(32) } }}
    />,
  );

  const name = screen.getByRole("textbox", { name: /Name/ });
  await user.clear(name);
  await user.type(name, "My RRG ticks");
  const description = screen.getByRole("textbox", { name: /Description/ });
  await user.clear(description);
  await user.type(description, "Mine now");
  await user.click(screen.getByRole("button", { name: "Copy list" }));

  await waitFor(() =>
    expect(copyClimbList).toHaveBeenCalledWith(
      { token: "a".repeat(32) },
      { title: "My RRG ticks", description: "Mine now" },
    ),
  );
  expect(push).toHaveBeenCalledWith("/users/alex/lists/12");
});

it("copies by id when there is no link", async () => {
  const user = userEvent.setup();
  render(<Example mode={{ kind: "copy", list: CLASSICS, own: true, source: { listId: 4 } }} />);
  await user.click(screen.getByRole("button", { name: "Copy list" }));
  await waitFor(() =>
    expect(copyClimbList).toHaveBeenCalledWith(
      { listId: 4 },
      { title: "Red River classics (copy)", description: "Moderates worth the drive" },
    ),
  );
});

it("disables Copy list when the name is cleared", async () => {
  const user = userEvent.setup();
  render(<Example mode={{ kind: "copy", list: CLASSICS, own: false, source: { listId: 4 } }} />);
  await user.clear(screen.getByRole("textbox", { name: /Name/ }));
  expect(screen.getByRole("button", { name: "Copy list" })).toBeDisabled();
  expect(copyClimbList).not.toHaveBeenCalled();
});

it("stays open with the server's message when a copy is refused", async () => {
  vi.mocked(copyClimbList).mockResolvedValue({ ok: false, error: "This list isn't available." });
  const user = userEvent.setup();
  render(<Example mode={{ kind: "copy", list: CLASSICS, own: false, source: { listId: 4 } }} />);

  await user.click(screen.getByRole("button", { name: "Copy list" }));

  expect(await screen.findByText("This list isn't available.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy list" })).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

it("saves an edit in place", async () => {
  const user = userEvent.setup();
  render(<Example mode={{ kind: "edit", list: CLASSICS }} />);

  const name = screen.getByRole("textbox", { name: /Name/ });
  await user.clear(name);
  await user.type(name, "RRG classics");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() =>
    expect(updateClimbList).toHaveBeenCalledWith(4, {
      title: "RRG classics",
      description: "Moderates worth the drive",
    }),
  );
  expect(refresh).toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});
