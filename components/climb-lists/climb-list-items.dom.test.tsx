import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { removeClimbFromList } from "@/actions";
import type { ClimbListItem } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import type { ClimbListView } from "@/lib/climb-lists";
import { climbListBreadcrumbs, climbListItemSamples } from "@/stories/fixtures/climb-lists";

import { ClimbListItems } from "./climb-list-items";

vi.mock("@/actions", () => ({
  removeClimbFromList: vi.fn<() => Promise<ActionResult>>(),
}));
vi.mock("@/components/climb-sent-indicator", () => ({
  ClimbSentIndicator: ({ sent }: { sent: boolean }) => <span>{sent ? "sent" : "not sent"}</span>,
}));

const replace = vi.fn<(href: string, options?: unknown) => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/users/alex/lists/1",
}));

const LIST_ORDER: ClimbListView = { sort: "position_asc", sent: "all" };

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
      orderAction={<button type="button">Reorder</button>}
    />,
  );
}

function rowNumbers() {
  return screen
    .getAllByRole("listitem")
    .map((row) => within(row).getByText(/Number/).parentElement?.textContent);
}

beforeEach(() => {
  replace.mockReset();
  vi.mocked(removeClimbFromList).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("numbers rows in the owner's order and offers Reorder only in list order", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems();
  expect(rowNumbers()).toEqual(["Number 1", "Number 2", "Number 3", "Number 4", "Number 5"]);
  expect(screen.getByRole("button", { name: "Reorder" })).toBeInTheDocument();
  unmount();

  const sorted = climbListItemSamples.toReversed();
  renderItems({ items: sorted, view: { sort: "name_desc", sent: "all" } });
  // Sorted rows keep their place in the owner's order as a muted "#n".
  expect(rowNumbers()).toEqual(["Number #5", "Number #4", "Number #3", "Number #2", "Number #1"]);
  expect(screen.queryByRole("button", { name: "Reorder" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Switch to list order to reorder" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
});

it("writes the sent filter to the URL and keeps the sort", async () => {
  const user = userEvent.setup();
  renderItems({ view: { sort: "grade_desc", sent: "all" } });

  await user.click(screen.getByRole("button", { name: "Unsent" }));

  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1?sort=grade_desc&sent=unsent", {
    scroll: false,
  });
});

it("says so when the filter matches nothing, and clears it", async () => {
  const user = userEvent.setup();
  renderItems({ items: [], view: { sort: "position_asc", sent: "unsent" } });

  expect(screen.getByText("You've sent every climb on this list.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear filter" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
});

it("hides the filter and sent state from a signed-out reader", () => {
  renderItems({
    signedIn: false,
    canEdit: false,
    items: climbListItemSamples.map((item) => ({ ...item, sent: null })),
  });
  expect(screen.queryByRole("button", { name: "Unsent" })).not.toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
});
