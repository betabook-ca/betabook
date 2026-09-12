import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { goalPanelStoryArgs, goalHistorySample } from "@/stories/fixtures/goal-samples";

import { GoalRecurringHistory } from "./goal-recurring-history";

it("shows whole recent months with both met and missed periods", async () => {
  const goal = goalHistorySample(3);
  if (!goal) throw new Error("Missing weekly goal");
  render(
    <GoalRecurringHistory
      ownerId="story-goals"
      goal={goal}
      today="2026-09-11"
      loadHistory={(offset) => goalPanelStoryArgs.loadHistory(3, offset, undefined)}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.getByRole("button", { name: "Week of Aug 24 · Missed · 1/3" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Week of Sep 7/ })).toBeVisible();
  expect(await screen.findByRole("button", { name: "Week of Jul 13 · Met · 3/3" })).toBeVisible();
  expect(screen.getAllByText("August")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Week of Aug 24 · Missed · 1/3" })).toHaveTextContent(
    "4",
  );
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("shows monthly results as twelve month circles grouped by year", async () => {
  const monthly = goalPanelStoryArgs.initialActive.goals.find((goal) => goal.id === 4);
  if (!monthly) throw new Error("Missing monthly fixture");
  render(
    <GoalRecurringHistory
      ownerId="story-goals"
      goal={goalHistorySample(4)}
      currentPeriod={monthly}
      today="2026-09-11"
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "See history" }));
  expect(
    screen.getAllByRole("button", {
      name: /^(January|February|March|April|May|June|July|August|September|October|November|December) ·/,
    }),
  ).toHaveLength(12);
  expect(screen.getByRole("button", { name: "June · Missed · 5/8" })).toBeVisible();
  expect(screen.getByRole("button", { name: "September · In progress · 4/8" })).toBeVisible();
  expect(screen.getByRole("button", { name: "October · Upcoming" })).toBeVisible();
});

it("loads three older months using a month cursor instead of the number of weeks", async () => {
  const { pageGoalHistory, summarizeGoalPeriods } = await import("@/lib/goal-history");
  const base = goalPanelStoryArgs.initialActive.goals.find((goal) => goal.id === 3);
  if (!base) throw new Error("Missing weekly fixture");
  const now = new Date("2026-09-11T12:00:00Z");
  const periods = Array.from({ length: 22 }, (_, i) => {
    const start = new Date("2026-04-13T12:00:00Z");
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      ...base,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      progress: 3,
      completedDate: start.toISOString().slice(0, 10),
    };
  });
  const goal = summarizeGoalPeriods(periods, "completed", 0, now).goals[0];
  render(
    <GoalRecurringHistory
      ownerId="story-goals"
      goal={goal}
      today="2026-09-11"
      loadHistory={async (offset, anchor) => pageGoalHistory(periods, "week", offset, now, anchor)}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.queryByText("June")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("April")).toBeVisible();
  expect(screen.getByText("May")).toBeVisible();
  expect(screen.getByText("June")).toBeVisible();
  expect(screen.getAllByText("August")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("sends the history cursor through the real fetch path and shows one retry alert", async () => {
  const { goalHistorySample } = await import("@/stories/fixtures/goal-samples");
  const source = goalHistorySample(3);
  if (!source.recurring) throw new Error("Missing history fixture");
  const goal = {
    ...source,
    recurring: { ...source.recurring, hasMore: true, nextOffset: 3, anchorMonth: "2026-09" },
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  try {
    render(<GoalRecurringHistory ownerId="api-owner" goal={goal} today="2026-09-11" />);
    await userEvent.click(screen.getByRole("button", { name: "See history" }));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    const request = fetcher.mock.calls[0][0];
    const url = new URL(request instanceof Request ? request.url : request, "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      historyId: String(goal.id),
      offset: String(goal.recurring?.nextOffset),
      anchor: goal.recurring?.anchorMonth,
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not label an unfinished month as missed in mixed-cadence history", async () => {
  const source = goalHistorySample(3);
  const current = {
    ...source,
    repeat: "month" as const,
    timeframe: "month" as const,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    progress: 1,
    target: 3,
    completedDate: null,
  };
  const mixed = {
    ...source,
    recurring: {
      met: 1,
      total: 1,
      hasMore: false,
      recent: [
        { ...source, repeat: "week" as const, periodStart: "2026-08-24", periodEnd: "2026-08-30" },
        current,
      ],
    },
  };
  render(
    <GoalRecurringHistory
      ownerId="owner"
      goal={mixed}
      currentPeriod={current}
      today="2026-09-11"
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.getByText("In progress · 1/3")).toBeVisible();
  expect(screen.queryByText("Missed · 1/3")).not.toBeInTheDocument();
});
