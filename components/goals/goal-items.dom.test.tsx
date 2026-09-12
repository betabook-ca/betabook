import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { GoalContribution } from "@/lib/goals";
import { goalPanelStoryArgs } from "@/stories/fixtures/goal-samples";

import { GoalItems } from "./goal-items";

it("shows completed climb names without links", async () => {
  const goal = goalPanelStoryArgs.initialCompleted.goals.find((g) => g.kind === "volume");
  if (!goal) throw new Error("Missing completed volume goal");
  render(<GoalItems ownerId="story-goals" goal={goal} loadItems={goalPanelStoryArgs.loadItems} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "5 climbs" }));
  expect(await screen.findByText("Cedar Arete")).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("ignores an older details response after closing and reopening history", async () => {
  const goal = goalPanelStoryArgs.initialCompleted.goals.find((g) => g.kind === "volume");
  if (!goal) throw new Error("Missing volume fixture");
  let resolveOld: (items: GoalContribution[]) => void = () => {
    throw new Error("Request not initialized");
  };
  const old = new Promise<GoalContribution[]>((resolve) => {
    resolveOld = resolve;
  });
  const load = vi
    .fn<() => Promise<GoalContribution[]>>()
    .mockReturnValueOnce(old)
    .mockResolvedValueOnce([{ id: 2, name: "Current climb", type: "climb" }]);
  render(<GoalItems ownerId="story-goals" goal={goal} loadItems={load} />);
  const user = userEvent.setup();
  const disclosure = screen.getByRole("button", { name: "5 climbs" });
  await user.click(disclosure);
  await user.click(disclosure);
  await user.click(disclosure);
  expect(await screen.findByText("Current climb")).toBeVisible();
  await act(async () => {
    resolveOld([{ id: 1, name: "Stale climb", type: "climb" }]);
  });
  expect(screen.queryByText("Stale climb")).not.toBeInTheDocument();
  expect(screen.getByText("Current climb")).toBeVisible();
});

it("requests the exact period bounds and handles a failed real fetch", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    const { goalPanelStoryArgs } = await import("@/stories/fixtures/goal-samples");
    const goal = goalPanelStoryArgs.initialActive.goals.find((goal) => goal.kind === "volume");
    if (!goal) throw new Error("Missing volume fixture");
    render(<GoalItems ownerId="api-owner" goal={{ ...goal, progress: 1 }} />);
    await userEvent.click(screen.getByRole("button", { name: "1 climb" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    const request = fetcher.mock.calls[0][0];
    const url = new URL(request instanceof Request ? request.url : request, "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      goalId: String(goal.id),
      periodStart: goal.periodStart,
      periodEnd: goal.periodEnd,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("invalidates loaded names when the goal receives a refreshed server snapshot", async () => {
  const goal = goalPanelStoryArgs.initialActive.goals.find((goal) => goal.kind === "volume");
  if (!goal) throw new Error("Missing volume fixture");
  const loadItems = vi
    .fn<NonNullable<Parameters<typeof GoalItems>[0]["loadItems"]>>()
    .mockResolvedValueOnce([{ id: 1, name: "Old climb", type: "climb" }])
    .mockResolvedValueOnce([{ id: 2, name: "Corrected climb", type: "climb" }]);
  const original = { ...goal, progress: 1 };
  const { rerender } = render(<GoalItems ownerId="owner" goal={original} loadItems={loadItems} />);
  await userEvent.click(screen.getByRole("button", { name: "1 climb" }));
  expect(await screen.findByText("Old climb")).toBeVisible();
  rerender(<GoalItems ownerId="owner" goal={{ ...original }} loadItems={loadItems} />);
  expect(screen.getByRole("button", { name: "1 climb" })).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(screen.getByRole("button", { name: "1 climb" }));
  expect(await screen.findByText("Corrected climb")).toBeVisible();
});
