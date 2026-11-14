import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { saveClimbListEdits } from "@/actions";
import type { ClimbListItem } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import {
  CLIMB_LIST_FULL_MESSAGE,
  MAX_CLIMB_LIST_ITEMS,
  type ClimbListView,
} from "@/lib/climb-lists";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import { climbListBreadcrumbs, climbListItemSamples } from "@/stories/fixtures/climb-lists";

import { ClimbListEditButton, ClimbListEditingProvider } from "./climb-list-editing";
import { ClimbListItems } from "./climb-list-items";

vi.mock("@/actions", () => ({
  saveClimbListEdits: vi.fn<() => Promise<ActionResult>>(),
}));
// A full list here is six climbs, not 500: rendering 500 editor rows in
// jsdom is slow enough to time out on a busy machine. The five samples plus
// one pick still fit.
vi.mock("@/lib/climb-lists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/climb-lists")>();
  return {
    ...actual,
    MAX_CLIMB_LIST_ITEMS: 6,
    CLIMB_LIST_FULL_MESSAGE: "A list can hold 6 climbs.",
  };
});
// The picker searches the catalog; here a staging pick is one button per climb.
const PICKED = {
  id: 106,
  name: "New Problem",
  type: "boulder" as const,
  grade: 3,
  areaId: 21,
  areaName: "Muir Valley",
  brokenOn: null,
};
const PICKED_TOO = { ...PICKED, id: 107, name: "Other Problem" };
vi.mock("@/components/climb-lists/add-climbs-dialog", async () => {
  const { useState } = await import("react");
  function AddClimbsDialog({
    state,
    onStage,
  }: {
    state: { isOpen: boolean };
    onStage?: (climb: typeof PICKED) => string | null;
  }) {
    // Like the real dialog, show why a pick wasn't staged.
    const [refused, setRefused] = useState<string | null>(null);
    if (!state.isOpen || !onStage) return null;
    return (
      <>
        {[PICKED, PICKED_TOO].map((climb) => (
          <button key={climb.id} type="button" onClick={() => setRefused(onStage(climb))}>
            Pick {climb.name}
          </button>
        ))}
        {refused && <p>{refused}</p>}
      </>
    );
  }
  return { AddClimbsDialog };
});
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
}>;

/** The list with the header's Edit button above it, as the list page joins them. */
function itemsElement(props: ItemsProps = {}) {
  const items = props.items ?? climbListItemSamples;
  return (
    <ClimbListEditingProvider>
      <ClimbListEditButton />
      <ClimbListItems
        items={items}
        totalCount={props.totalCount ?? climbListItemSamples.length}
        areaBreadcrumbs={climbListBreadcrumbs}
        view={props.view ?? CIRCUIT}
        signedIn={props.signedIn ?? true}
        listId={1}
        canEdit={props.canEdit ?? true}
        listTitle="Projects"
      />
    </ClimbListEditingProvider>
  );
}

function renderItems(props: ItemsProps = {}) {
  return render(itemsElement(props));
}

/** The climbs, not the filter toolbar's own lists. */
function rows() {
  return [...document.querySelectorAll<HTMLElement>("ol > li")];
}

/** Edit is a button in the list header. */
async function chooseEdit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Edit climbs" }));
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
  // Edit is the header's button; nothing beside the sort.
  expect(screen.queryByRole("button", { name: "List actions" })).not.toBeInTheDocument();
  await chooseEdit(user);
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
});

it("offers the discipline chips and Filters panel with Exclude sent, kept in the URL", async () => {
  const user = userEvent.setup();
  renderItems({ view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER } });

  for (const discipline of ["Boulder", "Sport", "Trad"])
    expect(screen.getByRole("button", { name: discipline })).toBeVisible();
  // A text box on the climb name, but no area lookup: a list's climbs are chosen.
  expect(screen.getByRole("searchbox", { name: "Filter climbs on this list" })).toBeVisible();
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

it("filters by climb name in the URL, keeping the sort, and lists it as a removable filter", async () => {
  const user = userEvent.setup();
  renderItems({ view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER } });
  await user.type(screen.getByRole("searchbox", { name: "Filter climbs on this list" }), "rat");

  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith("/users/alex/lists/1?name=rat&sort=grade_desc", {
      scroll: false,
    }),
  );
  await user.click(screen.getByRole("button", { name: "Remove Text: rat" }));
  expect(screen.getByRole("searchbox", { name: "Filter climbs on this list" })).toHaveValue("");
});

it("sets aside no area block above the toolbar, since a list has no area lookup", () => {
  renderItems();
  expect(document.querySelector('[data-slot="climb-filters-area"]')).toBeNull();
});

it("keeps typed text when the sort changes before the text is sent", async () => {
  const user = userEvent.setup();
  const { rerender } = renderItems();
  const box = screen.getByRole("searchbox", { name: "Filter climbs on this list" });
  await user.type(box, "cri");
  // The reader's new sort reaches the URL inside the text box's debounce.
  rerender(itemsElement({ view: { sort: "grade_desc", filter: DEFAULT_CLIMB_FILTER } }));
  expect(box).toHaveValue("cri");
  await waitFor(() =>
    expect(replace).toHaveBeenLastCalledWith("/users/alex/lists/1?name=cri&sort=grade_desc", {
      scroll: false,
    }),
  );
});

it("never sends typed text with the old sort while a new sort is on its way", async () => {
  const user = userEvent.setup();
  renderItems();
  await user.type(screen.getByRole("searchbox", { name: "Filter climbs on this list" }), "cri");
  await user.click(screen.getByRole("button", { name: "Sort ascending" }));
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1?sort=position_desc", { scroll: false });
  // The URL hasn't caught up; the text follows with the sort just chosen.
  await waitFor(() =>
    expect(replace).toHaveBeenLastCalledWith("/users/alex/lists/1?name=cri&sort=position_desc", {
      scroll: false,
    }),
  );
  expect(replace).not.toHaveBeenCalledWith("/users/alex/lists/1?name=cri", { scroll: false });
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
  // Nothing to save until something changes.
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  expect(screen.queryByText("Rat Stew")).not.toBeInTheDocument();
  expect(saveClimbListEdits).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104]));
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

it("clears the filters before editing, and lets no one but the owner edit", async () => {
  const user = userEvent.setup();
  const { unmount } = renderItems({ view: EXCLUDING_SENT });
  // Editing saves every climb, so choosing it clears the filters first.
  await chooseEdit(user);
  expect(replace).toHaveBeenCalledWith("/users/alex/lists/1", { scroll: false });
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  unmount();

  renderItems({ canEdit: false });
  expect(screen.getByRole("button", { name: "Edit climbs" })).toBeDisabled();
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
  await waitFor(() => expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104]));
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
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Too many changes — try again in a minute")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saveClimbListEdits).toHaveBeenLastCalledWith(1, [101, 102, 103, 104]));
});

it("disables every editor control while a save is in flight", async () => {
  let finish!: (result: ActionResult) => void;
  vi.mocked(saveClimbListEdits).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  await user.click(screen.getByRole("button", { name: "Save" }));

  for (const name of [
    "Remove Amarillo Sunset from this list",
    "Drag Gift of the Magi",
    "Add climbs",
    "Cancel",
  ])
    expect(screen.getByRole("button", { name })).toBeDisabled();

  finish({ ok: true, value: undefined });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "List actions" })).toBeInTheDocument(),
  );
});

it("adds climbs only in the editor, and disables Edit while it is open", async () => {
  const user = userEvent.setup();
  renderItems();
  // Outside the editor there is no Add climbs at all.
  expect(screen.queryByRole("button", { name: "Add climbs" })).not.toBeInTheDocument();
  await chooseEdit(user);
  expect(screen.getByRole("button", { name: "Edit climbs" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add climbs" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Edit climbs" })).toBeEnabled();
});

it("opens the editor on an empty list, where climbs are added", async () => {
  const user = userEvent.setup();
  renderItems({ items: [], totalCount: 0 });
  expect(
    screen.getByText("No climbs on this list yet. Choose Edit climbs to add some."),
  ).toBeInTheDocument();
  await chooseEdit(user);
  expect(screen.getByRole("button", { name: "Add climbs" })).toBeEnabled();
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
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104, 105, 106]),
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
  // Another tab took every climb off, and the page refreshed. The editor
  // stays open, still showing what it opened with (that is what Save writes).
  rerender(itemsElement({ items: [], totalCount: 0 }));
  const grid = screen.getByRole("grid", { name: "Edit climbs" });
  expect(within(grid).getByText("Amarillo Sunset")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add climbs" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("grid", { name: "Edit climbs" })).not.toBeInTheDocument();
  expect(screen.getByText(/^No climbs on this list yet\./)).toBeInTheDocument();
  rerender(itemsElement({ items: climbListItemSamples.slice(0, 1), totalCount: 1 }));
  expect(screen.queryByRole("grid", { name: "Edit climbs" })).not.toBeInTheDocument();
});

it("keeps showing what it opened with when the page refreshes mid-edit", async () => {
  const user = userEvent.setup();
  const { rerender } = renderItems();
  await chooseEdit(user);
  // Another tab took Gift of the Magi off, and something (a rename, say)
  // refreshed this page while the editor is open.
  rerender(
    itemsElement({
      items: climbListItemSamples.filter((item) => item.climbId !== 102),
      totalCount: climbListItemSamples.length - 1,
    }),
  );
  const grid = screen.getByRole("grid", { name: "Edit climbs" });
  expect(within(grid).getByText("Gift of the Magi")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  // Save sends exactly the rows on screen.
  await user.click(screen.getByRole("button", { name: "Remove Rat Stew from this list" }));
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104]));
});

it("stages a climb picked twice in quick succession once", async () => {
  const user = userEvent.setup();
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Add climbs" }));
  const pick = screen.getByRole("button", { name: "Pick New Problem" });
  // Both picks land before React re-renders.
  act(() => {
    fireEvent.click(pick);
    fireEvent.click(pick);
  });
  expect(screen.getAllByText("New Problem")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104, 105, 106]),
  );
});

it("refuses to stage past a full list, and says why", async () => {
  const user = userEvent.setup();
  const full = Array.from({ length: MAX_CLIMB_LIST_ITEMS }, (_, index) => ({
    ...climbListItemSamples[0],
    climbId: 1000 + index,
    name: `Climb ${index + 1}`,
    position: index + 1,
  }));
  renderItems({ items: full, totalCount: full.length });
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Add climbs" }));
  await user.click(screen.getByRole("button", { name: "Pick New Problem" }));
  expect(screen.getByText(CLIMB_LIST_FULL_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText("New Problem")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("tells a quick second pick the list is full instead of claiming it was added", async () => {
  const user = userEvent.setup();
  // Five climbs, room for one more.
  renderItems();
  await chooseEdit(user);
  await user.click(screen.getByRole("button", { name: "Add climbs" }));
  // Both picks land before React re-renders.
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Pick New Problem" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick Other Problem" }));
  });
  expect(screen.getByText(CLIMB_LIST_FULL_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText("Other Problem")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(saveClimbListEdits).toHaveBeenCalledWith(1, [101, 102, 103, 104, 105, 106]),
  );
});
