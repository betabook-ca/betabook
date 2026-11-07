import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";

import { AddToListButton } from "./add-to-list-button";
import type { ClimbListChoicesFetcher } from "./add-to-list-dialog";

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

it("opens the climber's lists for this climb from a button, not a menu", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn<ClimbListChoicesFetcher>(async () => climbListChoiceSamples);
  render(
    <AddToListButton
      climb={{ id: 101, name: "Amarillo Sunset" }}
      viewerId="alex"
      fetcher={fetcher}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Add to list" }));
  expect(
    await screen.findByRole("dialog", { name: "Add Amarillo Sunset to a list" }),
  ).toBeInTheDocument();
  expect(await screen.findByRole("checkbox", { name: /Red River classics/ })).toBeChecked();
  expect(fetcher).toHaveBeenCalledWith(101);
});
