import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { summarizeGoalPeriods } from "@/lib/goal-history";
import type { GoalPage, GoalProgress } from "@/lib/goals";
import { goalPanelStoryArgs, goalHistorySample } from "@/stories/fixtures/goal-samples";

import { GoalPanel } from "./goal-panel";
import { GoalRecurringHistory } from "./goal-recurring-history";

vi.mock("@/actions", () => ({
  saveGoal: vi.fn<typeof import("@/actions").saveGoal>(),
  deleteGoal: vi.fn<typeof import("@/actions").deleteGoal>(),
  archiveMissedGoal: vi.fn<typeof import("@/actions").archiveMissedGoal>(),
  acknowledgeGoalAchievements: vi.fn<typeof import("@/actions").acknowledgeGoalAchievements>(),
}));

it("keeps a separately supplied current year ahead of earlier annual history", async () => {
  const current: GoalProgress = {
    ...goalHistorySample(3),
    kind: "days",
    repeat: "year",
    timeframe: "year",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    target: 8,
    progress: 2,
    completedDate: null,
  };
  const prior: GoalProgress = {
    ...current,
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    progress: 8,
    completedDate: "2025-09-01",
  };
  const history = summarizeGoalPeriods([prior], "completed", 0, new Date("2026-09-11T12:00:00Z"))
    .goals[0];
  render(
    <GoalRecurringHistory
      ownerId="owner"
      goal={history}
      currentPeriod={current}
      today="2026-09-11"
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "See history" }));
  const years = screen.getAllByRole("listitem");
  expect(years).toHaveLength(2);
  expect(years[0]).toHaveTextContent("2026");
  expect(years[0]).toHaveTextContent("2/8");
  expect(years[1]).toHaveTextContent("2025");
  expect(years[1]).toHaveTextContent("8/8");
});

it("shows a fresh monthly period while the selected history year is still refreshing", async () => {
  const base = { ...goalHistorySample(3), recurring: undefined };
  const oldYear: GoalProgress = {
    ...base,
    repeat: "week",
    timeframe: "week",
    startDate: "2025-12-01",
    endDate: "2025-12-07",
    periodStart: "2025-12-01",
    periodEnd: "2025-12-07",
    progress: 3,
    target: 3,
    completedDate: "2025-12-05",
  };
  const endedWeek: GoalProgress = {
    ...oldYear,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-07",
    completedDate: "2026-06-05",
  };
  const oldCurrent: GoalProgress = {
    ...endedWeek,
    periodStart: "2026-06-08",
    periodEnd: "2026-06-14",
    progress: 1,
    completedDate: null,
  };
  const monthly: GoalProgress = {
    ...oldCurrent,
    repeat: "month",
    timeframe: "month",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    target: 8,
  };
  const now = new Date("2026-06-10T12:00:00Z");
  const oldPeriods = [oldYear, endedWeek, oldCurrent];
  const freshPeriods = [oldYear, endedWeek, monthly];
  let finish!: (page: GoalPage) => void;
  const loadPage = vi
    .fn<NonNullable<Parameters<typeof GoalPanel>[0]["loadPage"]>>()
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
  const props = {
    ownerId: "owner",
    timezone: "UTC",
    today: "2026-06-10",
    initialView: "completed" as const,
    loadPage,
  };
  const user = userEvent.setup();
  const view = render(
    <GoalPanel
      {...props}
      initialActive={summarizeGoalPeriods(oldPeriods, "active", 0, now)}
      initialCompleted={summarizeGoalPeriods(oldPeriods, "completed", 0, now, 2025)}
    />,
  );
  await user.click(screen.getByRole("button", { name: "See history" }));
  view.rerender(
    <GoalPanel
      {...props}
      initialActive={summarizeGoalPeriods(freshPeriods, "active", 0, now)}
      initialCompleted={summarizeGoalPeriods(freshPeriods, "completed", 0, now)}
    />,
  );
  await waitFor(() => expect(loadPage).toHaveBeenCalledExactlyOnceWith("completed", 0, 2025));
  expect(screen.getByRole("button", { name: "Week of Jun 1 · Met · 3/3" })).toBeVisible();
  expect(screen.getByText("Month · In progress · 1/8")).toBeVisible();
  await act(async () => finish(summarizeGoalPeriods(freshPeriods, "completed", 0, now, 2025)));
  await user.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.getAllByText("Month · In progress · 1/8")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Week of Jun 1 · Met · 3/3" })).toBeVisible();
});

it.each([
  { start: "2026-06-01", end: "2026-06-07", label: "Month · Met · 10/8" },
  { start: "2026-05-25", end: "2026-05-31", label: "Met · 10/8" },
])(
  "shows the achieved month count alongside weekly history starting $start",
  async ({ start, end, label }) => {
    const monthly: GoalProgress = {
      ...goalHistorySample(3),
      repeat: "month",
      timeframe: "month",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      target: 8,
      progress: 10,
      completedDate: "2026-06-09",
    };
    const weekly: GoalProgress = {
      ...monthly,
      repeat: "week",
      timeframe: "week",
      startDate: start,
      endDate: end,
      periodStart: start,
      periodEnd: end,
      target: 3,
      progress: 3,
      completedDate: end,
    };
    const history = summarizeGoalPeriods(
      [monthly, weekly],
      "completed",
      0,
      new Date("2026-06-10T12:00:00Z"),
    ).goals[0];
    render(
      <GoalRecurringHistory
        ownerId="owner"
        goal={history}
        currentPeriod={monthly}
        today="2026-06-10"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "See history" }));
    expect(screen.getAllByText(label)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Week of .* · Met · 3\/3/ })).toBeVisible();
  },
);

it.each([
  { month: "2026-09", weekStart: "2026-09-07", weekEnd: "2026-09-13", label: "Sep 7" },
  { month: "2026-06", weekStart: "2026-06-01", weekEnd: "2026-06-07", label: "Jun 1" },
])("retains both cadences when weekly and monthly periods overlap in $month", async (dates) => {
  const current = {
    ...goalHistorySample(3),
    repeat: "month" as const,
    timeframe: "month" as const,
    periodStart: `${dates.month}-01`,
    periodEnd: `${dates.month}-30`,
    progress: 1,
    target: 8,
    completedDate: null,
  };
  const weekly = {
    ...current,
    repeat: "week" as const,
    timeframe: "week" as const,
    periodStart: dates.weekStart,
    periodEnd: dates.weekEnd,
    completedDate: dates.weekEnd,
    progress: 3,
    target: 3,
  };
  const today = `${dates.month}-16`;
  const history = summarizeGoalPeriods(
    [current, weekly],
    "completed",
    0,
    new Date(`${today}T12:00:00Z`),
  ).goals[0];
  render(
    <GoalRecurringHistory ownerId="owner" goal={history} currentPeriod={current} today={today} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.getByRole("button", { name: `Week of ${dates.label} · Met · 3/3` })).toBeVisible();
  expect(screen.getByText("Month · In progress · 1/8")).toBeVisible();
});

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
