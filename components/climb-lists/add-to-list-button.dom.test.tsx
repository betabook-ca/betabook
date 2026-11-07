import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { addClimbToList, removeClimbFromList } from "@/actions";
import type { ClimbListChoice } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";

import { AddToListButton, type ClimbListChoicesFetcher } from "./add-to-list-button";

vi.mock("@/actions", () => ({
  addClimbToList: vi.fn<() => Promise<ActionResult>>(),
  removeClimbFromList: vi.fn<() => Promise<ActionResult>>(),
  createClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
  updateClimbList: vi.fn<() => Promise<ActionResult>>(),
  copyClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
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
  render(
    <AddToListButton
      climb={{ id: 101, name: "Amarillo Sunset" }}
      viewerId="alex"
      fetcher={fetcher}
    />,
  );
}

/** Opens the dialog and its dropdown, returning the dropdown's options. */
async function openDropdown(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to list" }));
  const dialog = await screen.findByRole("dialog", { name: "Add Amarillo Sunset to a list" });
  const input = await within(dialog).findByRole("combobox", { name: "Your lists" });
  await user.click(input);
  return { dialog, input, listbox: await screen.findByRole("listbox") };
}

beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(MANY.map((choice) => ({ ...choice })));
  vi.mocked(addClimbToList).mockReset().mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(removeClimbFromList).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("opens a dialog with the climber's lists in a dropdown, marking the ones holding the climb", async () => {
  const user = userEvent.setup();
  renderButton();
  expect(fetcher).not.toHaveBeenCalled();

  const { dialog, listbox } = await openDropdown(user);
  expect(fetcher).toHaveBeenCalledWith(101);
  expect(within(listbox).getAllByRole("option")).toHaveLength(MANY.length);
  expect(
    within(listbox).getByRole("option", { name: /^Red River classics, on this list/ }),
  ).toBeInTheDocument();
  // The lists it's already on also show as chips, once the dropdown closes.
  await user.keyboard("{Escape}");
  expect(
    await within(dialog).findByRole("button", { name: "Remove from Red River classics" }),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("On 1 list")).toBeInTheDocument();
});

it("narrows a long set of lists as the climber types", async () => {
  const user = userEvent.setup();
  renderButton();
  const { input } = await openDropdown(user);

  await user.type(input, "bish");
  await waitFor(() =>
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1),
  );
  expect(screen.getByRole("option", { name: /^Bishop wishlist/ })).toBeInTheDocument();

  await user.clear(input);
  await user.type(input, "nothing like it");
  expect(await screen.findByText("No lists match.")).toBeInTheDocument();
});

it("adds from the dropdown and removes from a chip", async () => {
  const user = userEvent.setup();
  renderButton();
  const { dialog, listbox } = await openDropdown(user);

  await user.click(within(listbox).getByRole("option", { name: /^Bishop wishlist/ }));
  await waitFor(() => expect(addClimbToList).toHaveBeenCalledWith(2, 101));
  // The dropdown stays open for another pick; close it to reach the chips.
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(
    await within(dialog).findByRole("button", { name: "Remove from Bishop wishlist" }),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("On 2 lists")).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Remove from Red River classics" }));
  await waitFor(() => expect(removeClimbFromList).toHaveBeenCalledWith(1, 101));
  await waitFor(() =>
    expect(
      within(dialog).queryByRole("button", { name: "Remove from Red River classics" }),
    ).not.toBeInTheDocument(),
  );
});

it("leaves the lists as they were and says why when the save fails", async () => {
  vi.mocked(addClimbToList).mockResolvedValue({ ok: false, error: "A list can hold 500 climbs." });
  const user = userEvent.setup();
  renderButton();
  const { dialog, listbox } = await openDropdown(user);

  await user.click(within(listbox).getByRole("option", { name: /^Bishop wishlist/ }));
  expect(await within(dialog).findByText("A list can hold 500 climbs.")).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("button", { name: "Remove from Bishop wishlist" }),
  ).not.toBeInTheDocument();
});

it("offers to make a list when there are none", async () => {
  fetcher.mockResolvedValue([]);
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: "Add to list" }));
  expect(
    await screen.findByText("You have no lists yet. Make one to add this climb."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /New list/ })).toBeInTheDocument();
});
