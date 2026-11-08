import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { saveClimbListEdits } from "@/actions";
import type { ClimbListItem } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import type { ClimbListView } from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { climbListBreadcrumbs, climbListItemSamples } from "@/stories/fixtures/climb-lists";

import { ClimbListItems } from "./climb-list-items";

vi.mock("@/actions", () => ({
  saveClimbListEdits: vi.fn<() => Promise<ActionResult>>(),
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

/** Edit lives in the owner's ⋯ menu beside the sort. */
async function chooseEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "List actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
}

beforeEach(() => {
  replace.mockReset();
  vi.mocked(saveClimbListEdits).mockReset().mockResolvedValue({ ok: true, value: undefined });
});

it("leaves rows unnumbered so the climb name keeps the width", () => {
  renderItems();
  // Nothing before the sent mark and the name: no number column.
  const rowTexts = rows().map((row) => row.textContent?.replace(/^(not sent|sent)/, "") ?? "");
  expect(rowTexts).toHaveLength(climbListItemSamples.length);
  for (const [index, text] of rowTexts.entries())
    expect(text.startsWith(climbListItemSamples[index].name)).toBe(true);
});

it("switches a sorted view back to list order when the owner chooses Edit", async () => {
  const user = userEvent.setup();
  renderItems({
    items: climbListItemSamples.toReversed(),
    view: { sort: "name_desc", filter: DEFAULT_CLIMB_FILTER },
  });
  // No standalone button: Edit is only in the menu.
  expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
  await chooseEdit(user);
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

it("offers Remove only in the editor, and saves removals with the order", async () => {
  const user = userEvent.setup();
  renderItems();
  expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();

  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  expect(screen.queryByText("Rat Stew")).not.toBeInTheDocument();
  expect(saveClimbListEdits).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104], [105]),
  );
});

it("puts removed climbs back on Cancel", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.getByRole("link", { name: "Rat Stew" })).toBeInTheDocument();
  expect(saveClimbListEdits).not.toHaveBeenCalled();
});

it("clears the filters before editing, and offers no menu to anyone but the owner", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems({ view: EXCLUDING_SENT });
  // Editing saves every climb, so choosing it clears the filters first.
  await chooseEdit(user);
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  unmount();

  renderItems({ canEdit: false });
  expect(screen.queryByRole("button", { name: "List actions" })).not.toBeInTheDocument();
});

it("moves climbs with the arrows and saves the whole order once", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);

  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Amarillo Sunset earlier" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move Rat Stew later" })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Move Amarillo Sunset later" }));
  expect(saveClimbListEdits).not.toHaveBeenCalled();

  await user.click(save);
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [102, 101, 103, 105, 104], []),
  );
  expect(await screen.findByRole("button", { name: "List actions" })).toBeInTheDocument();
});

it("keeps the editor open with the message when the list changed elsewhere", async () => {
  vi.mocked(saveClimbListEdits).mockResolvedValue({
    ok: false,
    error: "This list changed since you opened it. Reload to try again.",
  });
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(
    await screen.findByText("This list changed since you opened it. Reload to try again."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
});
