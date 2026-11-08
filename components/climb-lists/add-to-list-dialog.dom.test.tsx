import { useOverlayState } from "@heroui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { addClimbToList, removeClimbFromList } from "@/actions";
import type { ClimbListItemChange } from "@/actions/climb-lists";
import type { ClimbListChoice } from "@/db/queries";
import type { ActionResult } from "@/lib/action-result";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";

import { AddToListDialog, type ClimbListChoicesFetcher } from "./add-to-list-dialog";

vi.mock("@/actions", () => ({
  addClimbToList: vi.fn<() => Promise<ActionResult<ClimbListItemChange>>>(),
  removeClimbFromList: vi.fn<() => Promise<ActionResult<ClimbListItemChange>>>(),
  createClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
  updateClimbList: vi.fn<() => Promise<ActionResult>>(),
  copyClimbList: vi.fn<() => Promise<ActionResult<number>>>(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn<() => void>(), refresh: vi.fn<() => void>() }),
}));

const fetcher = vi.fn<ClimbListChoicesFetcher>();

function Example() {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <AddToListDialog
      state={state}
      userId="alex"
      climb={{ id: 101, name: "Amarillo Sunset" }}
      fetcher={fetcher}
    />
  );
}

beforeEach(() => {
  fetcher.mockReset().mockResolvedValue(climbListChoiceSamples.map((choice) => ({ ...choice })));
  vi.mocked(addClimbToList)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { changed: true, climbCount: 13 } });
  vi.mocked(removeClimbFromList)
    .mockReset()
    .mockResolvedValue({ ok: true, value: { changed: true, climbCount: 4 } });
});

it("loads the climber's lists for this climb and checks the ones that hold it", async () => {
  render(<Example />);
  expect(await screen.findByRole("checkbox", { name: /Red River classics/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Bishop wishlist/ })).not.toBeChecked();
  expect(fetcher).toHaveBeenCalledWith(101);
});

it("adds on check and removes on uncheck, updating the count", async () => {
  const user = userEvent.setup();
  render(<Example />);

  await user.click(await screen.findByRole("checkbox", { name: /Bishop wishlist/ }));
  await waitFor(() => expect(addClimbToList).toHaveBeenCalledWith(2, 101));
  expect(await screen.findByRole("checkbox", { name: /Bishop wishlist.*13 climbs/ })).toBeChecked();

  await user.click(screen.getByRole("checkbox", { name: /Red River classics/ }));
  await waitFor(() => expect(removeClimbFromList).toHaveBeenCalledWith(1, 101));
  expect(screen.getByRole("checkbox", { name: /Red River classics/ })).not.toBeChecked();
});

it("leaves the box as it was and says why when the save fails", async () => {
  vi.mocked(addClimbToList).mockResolvedValue({ ok: false, error: "A list can hold 500 climbs." });
  const user = userEvent.setup();
  render(<Example />);

  await user.click(await screen.findByRole("checkbox", { name: /Bishop wishlist/ }));
  expect(await screen.findByText("A list can hold 500 climbs.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Bishop wishlist/ })).not.toBeChecked();
});

it("offers to make a list when there are none", async () => {
  fetcher.mockResolvedValue([] as ClimbListChoice[]);
  render(<Example />);
  expect(
    await screen.findByText("You have no lists yet. Make one to add this climb."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /New list/ })).toBeInTheDocument();
});

it("shows the count the server reports, so a change made elsewhere doesn't drift it", async () => {
  // Already added from another tab: the server changes nothing and says 12.
  vi.mocked(addClimbToList).mockResolvedValue({
    ok: true,
    value: { changed: false, climbCount: 12 },
  });
  const user = userEvent.setup();
  render(<Example />);

  await user.click(await screen.findByRole("checkbox", { name: /Bishop wishlist/ }));
  expect(await screen.findByRole("checkbox", { name: /Bishop wishlist.*12 climbs/ })).toBeChecked();
});
