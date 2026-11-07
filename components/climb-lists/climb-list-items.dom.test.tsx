import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { removeClimbFromList, reorderClimbList } from "@/actions";
import type { ClimbListItem } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import type { ClimbListView } from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { climbListBreadcrumbs, climbListItemSamples } from "@/stories/fixtures/climb-lists";

import { ClimbListItems } from "./climb-list-items";

vi.mock("@/actions", () => ({
  removeClimbFromList: vi.fn<() => Promise<ActionResult>>(),
  reorderClimbList: vi.fn<() => Promise<ActionResult>>(),
}));
vi.mock("@/components/climb-sent-indicator", () => ({
  ClimbSentIndicator: ({ sent }: { sent: boolean }) => <span>{sent ? "sent" : "not sent"}</span>,
}));

const replace = vi.fn<(href: string, options?: unknown) => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/users/alex/lists/1",
}));

const LIST_ORDER: ClimbListView = { sort: "position_asc", filter: DEFAULT_CLIMB_FILTER };
const EXCLUDING_SENT: ClimbListView = {
  sort: "position_asc",
  filter: { ...DEFAULT_CLIMB_FILTER, excludeSent: true },
};

function renderItems(
  props: Partial<{
    items: ClimbListItem[];
    view: ClimbListView;
    canEdit: boolean;
    signedIn: boolean;
    totalCount: number;
  }> = {},
) {
  const items = props.items ?? climbListItemSamples;
  return render(
    <ClimbListItems
      items={items}
      totalCount={props.totalCount ?? climbListItemSamples.length}
      areaBreadcrumbs={climbListBreadcrumbs}
      view={props.view ?? LIST_ORDER}
      signedIn={props.signedIn ?? true}
      listId={1}
      canEdit={props.canEdit ?? true}
    />,
  );
}

/** The climbs, not the filter toolbar's own lists. */
function rows() {
  return [...document.querySelectorAll<HTMLElement>("ol > li")];
}

function rowNumbers() {
  return rows().map((row) => within(row).getByText(/Number/).parentElement?.textContent);
}

beforeEach(() => {
  replace.mockReset();
  vi.mocked(removeClimbFromList).mockReset().mockResolvedValue({ ok: true, value: undefined });
  vi.mocked(reorderClimbList).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("numbers rows in the owner's order and offers Reorder only in list order", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems();
  expect(rowNumbers()).toEqual(["Number 1", "Number 2", "Number 3", "Number 4", "Number 5"]);
  expect(screen.getByRole("button", { name: "Reorder" })).toBeInTheDocument();
  unmount();

  const sorted = climbListItemSamples.toReversed();
  renderItems({ items: sorted, view: { sort: "name_desc", filter: DEFAULT_CLIMB_FILTER } });
  // Sorted rows keep their place in the owner's order as a muted "#n".
  expect(rowNumbers()).toEqual(["Number #5", "Number #4", "Number #3", "Number #2", "Number #1"]);
  expect(screen.queryByRole("button", { name: "Reorder" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Switch to list order to reorder" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
});

it("offers the discipline chips and Filters panel with Exclude sent, kept in the URL", async () => {
  const user = userEvent.setup();
  renderItems({ view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER } });

  for (const discipline of ["Boulder", "Sport", "Trad"])
    expect(screen.getByRole("button", { name: discipline })).toBeVisible();
  // Find climbs' text box and area lookup aren't on a list.
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.queryByRole("combobox", { name: /area/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Exclude sent" }));

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith("/users/alex/lists/1?excludeSent=1&sort=grade_desc", {
      scroll: false,
    }),
  );
  expect(screen.getByRole("button", { name: "Remove Excluding sent" })).toBeInTheDocument();
});

it("says so when the filters match nothing, and clears them", async () => {
  const user = userEvent.setup();
  renderItems({ items: [], view: EXCLUDING_SENT });

  expect(screen.getByText("No climbs on this list match these filters.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
});

it("offers a signed-out reader the filters but not Exclude sent or sent state", async () => {
  const user = userEvent.setup();
  renderItems({
    signedIn: false,
    canEdit: false,
    items: climbListItemSamples.map((item) => ({ ...item, sent: null })),
  });
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.queryByRole("checkbox", { name: "Exclude sent" })).not.toBeInTheDocument();
  expect(screen.queryByText("sent")).not.toBeInTheDocument();
  expect(screen.queryByText("not sent")).not.toBeInTheDocument();
});

it("removes a climb for the owner, and offers no Remove to anyone else", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems();
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  await waitFor(() => expect(removeClimbFromList).toHaveBeenCalledWith(1, 105));
  unmount();

  renderItems({ canEdit: false });
  expect(screen.queryByRole("button", { name: /^Remove Rat/ })).not.toBeInTheDocument();
});

it("offers Reorder only on the whole, unfiltered list", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems({ view: EXCLUDING_SENT });
  expect(screen.queryByRole("button", { name: "Reorder" })).not.toBeInTheDocument();
  // A reorder saves every climb, so the filters have to go first.
  await user.click(screen.getByRole("button", { name: "Clear filters to reorder" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
  unmount();

  renderItems({ canEdit: false });
  expect(screen.queryByRole("button", { name: "Reorder" })).not.toBeInTheDocument();
});

it("moves climbs with the arrows and saves the whole order once", async () => {
  const user = userEvent.setup();
  renderItems();
  await user.click(screen.getByRole("button", { name: "Reorder" }));

  const save = screen.getByRole("button", { name: "Save order" });
  expect(save).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Amarillo Sunset earlier" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Rat Stew later" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Move Amarillo Sunset later" }));
  expect(reorderClimbList).not.toHaveBeenCalled();

  await user.click(save);
  await waitFor(() => expect(reorderClimbList).toHaveBeenCalledWith(1, [102, 101, 103, 105, 104]));
  expect(await screen.findByRole("button", { name: "Reorder" })).toBeInTheDocument();
});

it("keeps the editor open with the message when the list changed elsewhere", async () => {
  vi.mocked(reorderClimbList).mockResolvedValue({
    ok: false,
    error: "This list changed since you opened it. Reload to try again.",
  });
  const user = userEvent.setup();
  renderItems();
  await user.click(screen.getByRole("button", { name: "Reorder" }));
  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Save order" }));

  expect(
    await screen.findByText("This list changed since you opened it. Reload to try again."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save order" })).toBeInTheDocument();
});
