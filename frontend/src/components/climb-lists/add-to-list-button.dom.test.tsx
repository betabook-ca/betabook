import { Toast, toast } from "@heroui/react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ClimbListChoice } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { addClimbToList, createClimbList, type SavedClimbList } from "@/spa/lib/actions-client";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";
import { stubViewport } from "@/test/viewport";

import { AddToListButton, type ClimbListChoicesFetcher } from "./add-to-list-button";

vi.mock("@/spa/lib/actions-client", () => ({
  addClimbToList: vi.fn<() => Promise<ActionResult>>(),
  createClimbList: vi.fn<() => Promise<ActionResult<SavedClimbList>>>(),
  updateClimbList: vi.fn<() => Promise<ActionResult>>(),
  copyClimbList: vi.fn<() => Promise<ActionResult<SavedClimbList>>>(),
}));
const push = vi.fn<(href: string) => void>();
vi.mock("@/spa/lib/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn<() => void>() }),
}));

const fetcher = vi.fn<ClimbListChoicesFetcher>();

/** Enough lists that a checkbox per list would not fit. */
const MANY: ClimbListChoice[] = [
  ...climbListChoiceSamples,
  ...Array.from({ length: 30 }, (_, n) => ({
    id: 100 + n,
    title: `Project pile ${n + 1}`,
    climbCount: n,
    hasClimb: false,
  })),
];

function renderButton() {
  return render(
    <>
      <AddToListButton
        climb={{ id: 101, name: "Amarillo Sunset" }}
        viewerId="alex"
        fetcher={fetcher}
      />
      <Toast.Provider />
    </>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to list" }));
  const dialog = await screen.findByRole("dialog", { name: "Add Amarillo Sunset to a list" });
  const input = await within(dialog).findByRole("combobox", { name: "List" });
  return { dialog, input };
}

beforeEach(() => {
  // The toast region reads media queries, which jsdom lacks.
  stubViewport("desktop");
  fetcher.mockReset().mockResolvedValue(MANY.map((choice) => ({ ...choice })));
  vi.mocked(addClimbToList)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { changed: true, climbCount: 4 } });
  vi.mocked(createClimbList)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { id: 77, title: "Fall circuit" } });
  push.mockReset();
});
afterEach(async () => {
  // clear() animates each exit and drops the toast from the shared queue only
  // afterwards; wait so the next test's provider doesn't render it.
  toast.clear();
  await vi.waitUntil(() => toast.getQueue().visibleToasts.length === 0);
});

it("adds the climb to the one list chosen, then toasts a link to that list", async () => {
  const user = userEvent.setup();
  renderButton();
  const { dialog, input } = await openDialog(user);
  const add = within(dialog).getByRole("button", { name: "Add" });
  expect(add).toBeDisabled();

  await user.click(input);
  await user.click(await screen.findByRole("option", { name: /^Bishop wishlist/ }));
  expect(input).toHaveValue("Bishop wishlist");
  await user.click(add);

  await waitFor(() => expect(addClimbToList).toHaveBeenCalledExactlyOnceWith(2, 101));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Add Amarillo Sunset to a list" }),
    ).not.toBeInTheDocument(),
  );
  expect(await screen.findByText(/Added Amarillo Sunset to/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Bishop wishlist" })).toHaveAttribute(
    "href",
    "/users/alex/lists/2",
  );
});

it("narrows a long set of lists and won't offer one that already has the climb", async () => {
  const user = userEvent.setup();
  renderButton();
  const { input } = await openDialog(user);

  await user.click(input);
  const listbox = await screen.findByRole("listbox");
  expect(within(listbox).getAllByRole("option")).toHaveLength(MANY.length);
  expect(
    within(listbox).getByRole("option", { name: /^Red River classics.*Already on this list/ }),
  ).toHaveAttribute("aria-disabled", "true");

  await user.type(input, "bish");
  await waitFor(() =>
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1),
  );
});

it("stays open with the reason when the add fails", async () => {
  vi.mocked(addClimbToList).mockResolvedValue({ ok: false, error: "A list can hold 500 climbs." });
  const user = userEvent.setup();
  renderButton();
  const { dialog, input } = await openDialog(user);

  await user.click(input);
  await user.click(await screen.findByRole("option", { name: /^Bishop wishlist/ }));
  await user.click(within(dialog).getByRole("button", { name: "Add" }));

  expect(await within(dialog).findByText("A list can hold 500 climbs.")).toBeInTheDocument();
  expect(screen.queryByText(/Added Amarillo Sunset to/)).not.toBeInTheDocument();
});

it("creates a new list with the climb on it and toasts a link, staying on the climb", async () => {
  const user = userEvent.setup();
  renderButton();
  const { dialog } = await openDialog(user);

  await user.click(within(dialog).getByRole("button", { name: /New list/ }));
  const create = await screen.findByRole("dialog", { name: "New list" });
  await user.type(within(create).getByRole("textbox", { name: /Name/ }), "Fall circuit");
  await user.click(within(create).getByRole("button", { name: "Create list" }));

  await waitFor(() =>
    expect(createClimbList).toHaveBeenCalledWith(
      { title: "Fall circuit", description: "" },
      { climbId: 101 },
    ),
  );
  expect(await screen.findByRole("link", { name: "Fall circuit" })).toHaveAttribute(
    "href",
    "/users/alex/lists/77",
  );
  expect(push).not.toHaveBeenCalled();
});

it("names the new list in the toast as the server saved it, not as typed", async () => {
  vi.mocked(createClimbList).mockResolvedValue({
    ok: true,
    value: { id: 78, title: "Saved name" },
  });
  const user = userEvent.setup();
  renderButton();
  const { dialog } = await openDialog(user);

  await user.click(within(dialog).getByRole("button", { name: /New list/ }));
  const create = await screen.findByRole("dialog", { name: "New list" });
  await user.type(within(create).getByRole("textbox", { name: /Name/ }), "  Typed   name ");
  await user.click(within(create).getByRole("button", { name: "Create list" }));

  expect(await screen.findByRole("link", { name: "Saved name" })).toHaveAttribute(
    "href",
    "/users/alex/lists/78",
  );
  expect(screen.queryByRole("link", { name: "Typed name" })).not.toBeInTheDocument();
});

it("does not show the previous viewer's private list after a delayed add", async () => {
  const user = userEvent.setup();
  let finish!: (result: Awaited<ReturnType<typeof addClimbToList>>) => void;
  vi.mocked(addClimbToList).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { rerender } = renderButton();
  const { dialog, input } = await openDialog(user);
  await user.type(input, "Bishop");
  await user.click(await screen.findByRole("option", { name: /Bishop wishlist/ }));
  await user.click(within(dialog).getByRole("button", { name: "Add" }));
  expect(addClimbToList).toHaveBeenCalledExactlyOnceWith(2, 101);
  // The account-scoped content unmounts when the viewer changes, but the app
  // shell's toast provider stays mounted.
  rerender(
    <>
      <h1>Signed out</h1>
      <Toast.Provider />
    </>,
  );
  await act(async () => {
    finish({ ok: true, value: { changed: true, climbCount: 4 } });
  });
  expect(screen.queryByRole("link", { name: "Bishop wishlist" })).not.toBeInTheDocument();
});
