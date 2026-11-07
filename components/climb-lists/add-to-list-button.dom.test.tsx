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

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to list" }));
  // The menu trigger names the menu after its button.
  return screen.findByRole("menu", { name: "Add to list" });
}

beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(MANY.map((choice) => ({ ...choice })));
  vi.mocked(addClimbToList).mockReset().mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(removeClimbFromList).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("loads the climber's lists when opened, with the ones holding the climb checked", async () => {
  const user = userEvent.setup();
  renderButton();
  expect(fetcher).not.toHaveBeenCalled();

  const menu = await openMenu(user);
  expect(fetcher).toHaveBeenCalledWith(101);
  expect(within(menu).getByRole("menuitemcheckbox", { name: /Red River classics/ })).toBeChecked();
  expect(within(menu).getByRole("menuitemcheckbox", { name: /Bishop wishlist/ })).not.toBeChecked();
});

it("narrows a long set of lists as the climber types", async () => {
  const user = userEvent.setup();
  renderButton();
  const menu = await openMenu(user);
  expect(within(menu).getAllByRole("menuitemcheckbox")).toHaveLength(MANY.length);

  await user.type(screen.getByRole("searchbox", { name: "Search your lists" }), "bish");
  await waitFor(() =>
    expect(
      within(menu)
        .getAllByRole("menuitemcheckbox")
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining("Bishop wishlist")]),
  );

  await user.clear(screen.getByRole("searchbox", { name: "Search your lists" }));
  await user.type(screen.getByRole("searchbox", { name: "Search your lists" }), "nothing like it");
  expect(await within(menu).findByText("No lists match.")).toBeInTheDocument();
});

it("adds on pick and removes on a second pick, staying open between them", async () => {
  const user = userEvent.setup();
  renderButton();
  const menu = await openMenu(user);

  await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Bishop wishlist/ }));
  await waitFor(() => expect(addClimbToList).toHaveBeenCalledWith(2, 101));
  expect(
    await within(menu).findByRole("menuitemcheckbox", { name: /Bishop wishlist.*13 climbs/ }),
  ).toBeChecked();

  await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Red River classics/ }));
  await waitFor(() => expect(removeClimbFromList).toHaveBeenCalledWith(1, 101));
  expect(
    within(menu).getByRole("menuitemcheckbox", { name: /Red River classics/ }),
  ).not.toBeChecked();
});

it("leaves the list as it was and says why when the save fails", async () => {
  vi.mocked(addClimbToList).mockResolvedValue({ ok: false, error: "A list can hold 500 climbs." });
  const user = userEvent.setup();
  renderButton();
  const menu = await openMenu(user);

  await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Bishop wishlist/ }));
  expect(await screen.findByText("A list can hold 500 climbs.")).toBeInTheDocument();
  expect(within(menu).getByRole("menuitemcheckbox", { name: /Bishop wishlist/ })).not.toBeChecked();
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
