import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// The picker searches the catalog; here a staging pick is one button.
const PICKED = {
  id: 106,
  name: "New Problem",
  type: "boulder" as const,
  grade: 3,
  areaId: 21,
  areaName: "Muir Valley",
  brokenOn: null,
};
vi.mock("@/components/climb-lists/add-climbs-dialog", () => ({
  AddClimbsDialog: ({
    state,
    onStage,
  }: {
    state: { isOpen: boolean };
    onStage?: (climb: typeof PICKED) => void;
  }) =>
    state.isOpen && onStage ? (
      <button type="button" onClick={() => onStage(PICKED)}>
        Pick New Problem
      </button>
    ) : null,
}));
vi.mock("@/components/climb-sent-indicator", () => ({
  ClimbSentIndicator: ({ sent }: { sent: boolean }) => <span>{sent ? "sent" : "not sent"}</span>,
}));

const replace = vi.fn<(href: string, options?: unknown) => void>();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn<(href: string) => void>() }),
  usePathname: () => "/users/alex/lists/1",
}));

const CIRCUIT: ClimbListView = { sort: "position_asc", filter: DEFAULT_CLIMB_FILTER };
const EXCLUDING_SENT: ClimbListView = {
  sort: "position_asc",
  filter: { ...DEFAULT_CLIMB_FILTER, excludeSent: true },
};

type ItemsProps = Partial<{
  items: ClimbListItem[];
  view: ClimbListView;
  canEdit: boolean;
  signedIn: boolean;
  totalCount: number;
  withAddClimbs: boolean;
}>;

function itemsElement(props: ItemsProps = {}) {
  const items = props.items ?? climbListItemSamples;
  return (
    <ClimbListItems
      items={items}
      totalCount={props.totalCount ?? climbListItemSamples.length}
      areaBreadcrumbs={climbListBreadcrumbs}
      view={props.view ?? CIRCUIT}
      signedIn={props.signedIn ?? true}
      listId={1}
      canEdit={props.canEdit ?? true}
      addClimbs={
        props.withAddClimbs
          ? { listTitle: "Projects", climbIds: items.map((item) => item.climbId) }
          : undefined
      }
    />
  );
}

function renderItems(props: ItemsProps = {}) {
  return render(itemsElement(props));
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

it("switches a sorted view back to circuit order when the owner chooses Edit", async () => {
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
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104], [105], []),
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
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [102, 101, 103, 105, 104], [], []),
  );
  expect(await screen.findByRole("button", { name: "List actions" })).toBeInTheDocument();
});

it("stages a double-tapped Remove once", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  const remove = screen.getByRole("button", { name: "Remove Rat Stew from this list" });
  // Both taps land before React re-renders the row away.
  act(() => {
    fireEvent.click(remove);
    fireEvent.click(remove);
  });
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104], [105], []),
  );
});

it("drops an Edit request when the view lands somewhere other than the plain list", async () => {
  const user = userEvent.setup();
  const { rerender } = renderItems({ view: EXCLUDING_SENT });
  await chooseEdit(user);
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });

  // The reader picks another sort before the plain list arrives.
  rerender(itemsElement({ view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER } }));
  rerender(itemsElement({ view: CIRCUIT }));
  expect(screen.queryByRole("grid", { name: "Edit climbs" })).not.toBeInTheDocument();
});

it("opens the editor once the plain list arrives after choosing Edit", async () => {
  const user = userEvent.setup();
  const { rerender } = renderItems({ view: EXCLUDING_SENT });
  await chooseEdit(user);
  rerender(itemsElement({ view: CIRCUIT }));
  expect(screen.getByRole("grid", { name: "Edit climbs" })).toBeInTheDocument();
});

it("keeps the edits and shows the error when a save fails", async () => {
  vi.mocked(saveClimbListEdits).mockResolvedValueOnce({
    ok: false,
    error: "Too many changes — try again in a minute",
  });
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Too many changes — try again in a minute")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenLastCalledWith(1, [101, 102, 103, 105, 104], [], []),
  );
});

it("disables every editor control while a save is in flight", async () => {
  vi.mocked(saveClimbListEdits).mockReturnValue(new Promise(() => {}));
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Move Rat Stew earlier" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  for (const name of [
    "Remove Amarillo Sunset from this list",
    "Move Gift of the Magi earlier",
    "Move Gift of the Magi later",
    "Drag Gift of the Magi",
    "Add climbs",
    "Cancel",
  ])
    expect(screen.getByRole("button", { name })).toBeDisabled();
});

it("disables the list's Add climbs while editing", async () => {
  const user = userEvent.setup();
  renderItems({ withAddClimbs: true });
  const [header] = screen.getAllByRole("button", { name: "Add climbs" });
  expect(header).toBeEnabled();
  await chooseEdit(user);
  const [headerWhileEditing, editorAdd] = screen.getAllByRole("button", { name: "Add climbs" });
  expect(headerWhileEditing).toBeDisabled();
  expect(editorAdd).toBeEnabled();
});

it("stages a climb added in the editor and saves it with the rest", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Add climbs" }));
  await user.click(screen.getByRole("button", { name: "Pick New Problem" }));
  expect(screen.getByText("New Problem")).toBeInTheDocument();
  expect(saveClimbListEdits).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104, 105, 106], [], [106]),
  );
});

it("takes a climb added in the editor back off without staging a removal", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Add climbs" }));
  await user.click(screen.getByRole("button", { name: "Pick New Problem" }));
  await user.click(screen.getByRole("button", { name: "Remove New Problem from this list" }));
  expect(screen.queryByText("New Problem")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("keeps the editor open when the list empties, so it never reopens on its own", async () => {
  const user = userEvent.setup();
  const { rerender } = renderItems();
  await chooseEdit(user);
  // Another tab took every climb off, and the page refreshed.
  rerender(itemsElement({ items: [], totalCount: 0 }));
  expect(screen.getByRole("grid", { name: "Edit climbs" })).toBeInTheDocument();
  expect(screen.getByText("No climbs on this list yet.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add climbs" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("grid", { name: "Edit climbs" })).not.toBeInTheDocument();
  rerender(itemsElement({ items: climbListItemSamples.slice(0, 1), totalCount: 1 }));
  expect(screen.queryByRole("grid", { name: "Edit climbs" })).not.toBeInTheDocument();
});
