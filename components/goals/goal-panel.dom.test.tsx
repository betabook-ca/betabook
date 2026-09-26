import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { GoalPage, GoalProgress } from "@/lib/goals";

import { GoalPanel } from "./goal-panel";

vi.mock("@/actions", () => ({
  saveGoal: vi.fn<() => Promise<unknown>>(),
  deleteGoal: vi.fn<() => Promise<unknown>>(),
  archiveGoal: vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true }),
  acknowledgeGoalAchievements: vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true }),
}));
const goal: GoalProgress = {
  id: 1,
  userId: "owner",
  kind: "training",
  target: 8,
  discipline: null,
  grade: null,
  timeframe: "month",
  repeat: "none",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  timezone: "UTC",
  progress: 2,
  completedDate: null,
};
it("hides empty tabs and opens the real goal form for the owner", async () => {
  const user = userEvent.setup();
  render(
    <GoalPanel
      ownerId="new-owner"
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{ goals: [], hasMore: false }}
      timezone="UTC"
      today="2026-09-11"
    />,
  );
  expect(screen.queryByRole("navigation", { name: "Goal views" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Set goal" }));
  expect(
    await screen.findByRole("heading", { name: "What do you want to work on?" }),
  ).toBeVisible();
});

it("switches the completed list and tab count when choosing a year", async () => {
  const { goalPanelStoryArgs } = await import("@/stories/fixtures/goal-samples");
  render(<GoalPanel {...goalPanelStoryArgs} initialView="completed" />);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "History (20)" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /History year/ }));
  await user.click(screen.getByRole("option", { name: "2025" }));
  expect(await screen.findByRole("button", { name: "History (1)" })).toBeVisible();
});

it("hides the year selector when completed history only has one year", async () => {
  render(
    <GoalPanel
      ownerId="one-year-owner"
      timezone="UTC"
      today="2026-09-11"
      initialView="completed"
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{
        goals: [{ ...goal, progress: 8, completedDate: "2026-09-02" }],
        hasMore: false,
        total: 1,
        years: [2026],
        summary: {
          year: 2026,
          achieved: 1,
        },
      }}
    />,
  );
  expect(screen.queryByText("1 goal achieved")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /History year/ })).not.toBeInTheDocument();
});

it("keeps recurring history exclusively in Completed", async () => {
  const { goalPanelStoryArgs, goalHistorySample } = await import("@/stories/fixtures/goal-samples");
  const weekly = goalPanelStoryArgs.initialActive.goals.find((g) => g.id === 3);
  if (!weekly) throw new Error("Missing weekly goal");
  render(
    <GoalPanel
      {...goalPanelStoryArgs}
      initialActive={{ goals: [weekly], hasMore: false }}
      initialCompleted={{
        goals: [goalHistorySample(3)],
        hasMore: false,
        total: 1,
      }}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByRole("progressbar")).toBeVisible();
  expect(screen.queryByRole("button", { name: "See history" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "History (1)" }));
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "See history" }));
  expect(screen.getByRole("button", { name: /Week of Aug 24/ })).toBeVisible();
});

it("aggregates today’s achievements into one dismissible banner", async () => {
  const first = {
    ...goal,
    id: 101,
    userId: "celebration-owner",
    repeat: "week" as const,
    timeframe: "week" as const,
    startDate: "2026-09-07",
    endDate: "2026-09-13",
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
    target: 1,
    progress: 1,
    completedDate: "2026-09-11",
  };
  const second = { ...first, id: 102, repeat: "none" as const, target: 2, progress: 2 };
  render(
    <GoalPanel
      ownerId="celebration-owner"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [first], hasMore: false }}
      initialCompleted={{ goals: [first, second], hasMore: false, celebrations: [first, second] }}
    />,
  );
  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Dismiss achievement" });
  expect(screen.getByRole("status")).toHaveTextContent("2 goals achieved");
  await user.click(screen.getByRole("button", { name: "Dismiss achievement" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Dismiss achievement" })).not.toBeInTheDocument(),
  );
});

it("uses the real history API parameters and keeps pagination failures isolated", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("{}", { status: 500 }))
    .mockResolvedValueOnce(
      Response.json({ goals: [{ ...goal, id: 9 }], hasMore: false, total: 2 }),
    );
  vi.stubGlobal("fetch", fetcher);
  try {
    render(
      <GoalPanel
        ownerId="api-owner"
        initialView="completed"
        timezone="UTC"
        today="2026-09-11"
        initialActive={{ goals: [], hasMore: false }}
        initialCompleted={{
          goals: [goal],
          hasMore: true,
          total: 2,
          summary: { year: 2025, achieved: 1 },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    const request = fetcher.mock.calls[0][0];
    const url = new URL(request instanceof Request ? request.url : request, "http://localhost");
    expect(url.pathname).toBe("/api/users/api-owner/goals");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: "completed",
      offset: "1",
      year: "2025",
    });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("preserves the history year and loaded depth when the server snapshot changes", async () => {
  let updated = false;
  const past = Array.from({ length: 6 }, (_, index) => ({
    ...goal,
    id: index + 10,
    target: index + 20,
    progress: index + 20,
    completedDate: "2025-09-01",
  }));
  const loadPage = vi.fn<NonNullable<Parameters<typeof GoalPanel>[0]["loadPage"]>>(
    async (offset, year) => ({
      goals: past
        .slice(offset, offset + 5)
        .map((goal) => ({ ...goal, target: updated ? goal.target + 100 : goal.target })),
      hasMore: offset === 0,
      total: 6,
      summary: { year, achieved: 6 },
      years: [2026, 2025],
    }),
  );
  const props = {
    ownerId: "refresh-owner",
    initialView: "completed" as const,
    timezone: "UTC",
    today: "2026-09-11",
    initialActive: { goals: [], hasMore: false },
    initialCompleted: {
      goals: [goal],
      hasMore: false,
      total: 1,
      summary: { year: 2026, achieved: 1 },
      years: [2026, 2025],
    },
    loadPage,
  };
  const { rerender } = render(<GoalPanel {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /History year/ }));
  await user.click(screen.getByRole("option", { name: "2025" }));
  await user.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Train 25 times")).toBeVisible();
  updated = true;
  rerender(
    <GoalPanel
      {...props}
      initialCompleted={{ ...props.initialCompleted, goals: [{ ...goal, id: 2 }] }}
    />,
  );
  expect(await screen.findByText("Train 125 times")).toBeVisible();
  expect(screen.getByRole("button", { name: /History year/ })).toHaveTextContent("2025");
  expect(screen.getByRole("button", { name: "History (6)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(loadPage).toHaveBeenLastCalledWith(5, 2025);
});

it("shows the chosen year and marks the rows busy until that year loads", async () => {
  let finish!: (page: GoalPage) => void;
  const loadPage = vi
    .fn<NonNullable<Parameters<typeof GoalPanel>[0]["loadPage"]>>()
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
  render(
    <GoalPanel
      ownerId="pending-owner"
      initialView="completed"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{
        goals: [goal],
        hasMore: false,
        total: 1,
        years: [2026, 2025],
        summary: { year: 2026, achieved: 1 },
      }}
      loadPage={loadPage}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /History year/ }));
  await user.click(screen.getByRole("option", { name: "2025" }));
  expect(screen.getByRole("button", { name: /History year/ })).toHaveTextContent("2025");
  const rows = screen.getByText("Train 8 times").closest("[aria-busy]");
  expect(rows).toHaveAttribute("aria-busy", "true");
  await act(async () =>
    finish({
      goals: [{ ...goal, id: 2, target: 9, progress: 9, completedDate: "2025-09-01" }],
      hasMore: false,
      total: 1,
      years: [2026, 2025],
      summary: { year: 2025, achieved: 1 },
    }),
  );
  expect(await screen.findByText("Train 9 times")).toBeVisible();
  expect(screen.queryByText("Train 8 times")).not.toBeInTheDocument();
  expect(rows).toHaveAttribute("aria-busy", "false");
});

it("restarts an expired goal as a new goal instead of rewriting its history", async () => {
  const { saveGoal } = await import("@/actions");
  vi.mocked(saveGoal).mockResolvedValueOnce({ ok: true, value: 42 });
  const expired = {
    ...goal,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  };
  render(
    <GoalPanel
      ownerId="owner"
      initialView="active"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [expired], hasMore: false }}
      initialCompleted={{ goals: [], hasMore: false }}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByText("Not met")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(saveGoal).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ startDate: "2026-09-01", endDate: "2026-09-30", repeat: "none" }),
      expired.id,
    ),
  );
});

it("retries the failed year request without marking Load more as failed", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("{}", { status: 500 }))
    .mockResolvedValueOnce(
      Response.json({
        goals: [goal],
        hasMore: false,
        total: 1,
        years: [2026, 2025],
        summary: { year: 2025, achieved: 1 },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  try {
    render(
      <GoalPanel
        ownerId="year-retry"
        initialView="completed"
        timezone="UTC"
        today="2026-09-11"
        initialActive={{ goals: [], hasMore: false }}
        initialCompleted={{
          goals: [goal],
          hasMore: true,
          total: 2,
          years: [2026, 2025],
          summary: { year: 2026, achieved: 1 },
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /History year/ }));
    await user.click(screen.getByRole("option", { name: "2025" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Couldn't refresh goals. Try again.");
    expect(screen.queryByText("Couldn't load more — try again.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /History year/ })).toHaveTextContent("2026");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /History year/ })).toHaveTextContent("2025"),
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/users/year-retry/goals?view=completed&offset=0&year=2025",
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it("leaves a missed goal in Active when retry is cancelled and offers no retry actions in History", async () => {
  const { archiveGoal, saveGoal } = await import("@/actions");
  vi.mocked(saveGoal).mockClear();
  const missed = {
    ...goal,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  };
  const props = {
    ownerId: "owner",
    timezone: "UTC",
    today: "2026-09-11",
    initialActive: { goals: [missed], hasMore: false },
    initialCompleted: {
      goals: [] as GoalProgress[],
      hasMore: false,
      summary: { year: 2026, achieved: 0 },
      years: [2026],
    },
  };
  const { rerender } = render(<GoalPanel {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await user.click(screen.getByRole("button", { name: /^Close$/ }));
  expect(saveGoal).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Archive goal" }));
  await waitFor(() => expect(archiveGoal).toHaveBeenCalledWith(missed.id));
  rerender(
    <GoalPanel
      {...props}
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{
        ...props.initialCompleted,
        goals: [{ ...missed, archived: true }],
        total: 1,
      }}
    />,
  );
  await user.click(await screen.findByRole("button", { name: "History (1)" }));
  expect(screen.getByText("Not met")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Archive goal" })).not.toBeInTheDocument();
});

it("retains Edit and Delete alongside the visible missed-goal actions", async () => {
  const missed = {
    ...goal,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  };
  render(
    <GoalPanel
      ownerId="owner"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [missed], hasMore: false }}
      initialCompleted={{ goals: [], hasMore: false }}
    />,
  );
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Archive goal" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Actions for Train 8 times" }));
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

it("shows completed one-time goals in History without an archive option", async () => {
  const user = userEvent.setup();
  const finished = Array.from({ length: 8 }, (_, index) => ({
    ...goal,
    id: index + 1,
    target: index + 1,
    progress: index + 1,
    completedDate: "2026-09-02",
  }));
  render(
    <GoalPanel
      ownerId="owner"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{
        goals: finished.slice(0, 5),
        total: 8,
        hasMore: true,
        summary: { year: 2026, achieved: 8 },
        years: [2026],
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Active (0/5)" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Set goal" })).toBeEnabled();
  expect(screen.getByText("No active goals.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "History (8)" }));
  expect(screen.getByText("Train 1 time")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Actions for Train 1 time" }));
  expect(screen.queryByRole("menuitem", { name: "Archive goal" })).not.toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

it("shows no end date for an ongoing routine and edits it from the actions menu", async () => {
  const user = userEvent.setup();
  const routine = {
    ...goal,
    repeat: "week" as const,
    timeframe: "week" as const,
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
  };
  render(
    <GoalPanel
      ownerId="owner"
      timezone="UTC"
      today="2026-09-11"
      initialActive={{ goals: [routine], hasMore: false }}
      initialCompleted={{
        goals: [{ ...routine, periodStart: "2026-08-31", periodEnd: "2026-09-06" }],
        hasMore: false,
      }}
    />,
  );
  expect(screen.getByText("No end date")).toBeVisible();
  expect(screen.queryByRole("button", { name: "End routine" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Actions for/ }));
  expect(screen.queryByRole("menuitem", { name: "End routine" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  await user.click(await screen.findByRole("button", { name: /Recurrence end/ }));
  await user.click(screen.getByRole("option", { name: "Custom date" }));
  expect(screen.getByRole("spinbutton", { name: "day, End date" })).toBeVisible();
});

it("keeps a scheduled routine's end date editable through Edit only", async () => {
  const user = userEvent.setup();
  render(
    <GoalPanel
      ownerId="owner"
      timezone="UTC"
      today="2026-09-12"
      initialActive={{
        goals: [
          {
            ...goal,
            repeat: "month",
            today: "2026-09-11",
            timezone: "America/Los_Angeles",
            recurringEndDate: "2026-09-11",
            periodEnd: "2026-09-11",
          },
        ],
        hasMore: false,
      }}
      initialCompleted={{ goals: [], hasMore: false }}
    />,
  );
  expect(screen.getByText("Ends Sep 11")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Change end date" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Actions for/ }));
  expect(screen.queryByRole("menuitem", { name: "Change end date" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(await screen.findByRole("spinbutton", { name: "day, End date" })).toHaveTextContent("11");
});

it("creates recurring training without an end date by default", async () => {
  const { saveGoal } = await import("@/actions");
  vi.mocked(saveGoal).mockResolvedValue({ ok: true, value: 123 });
  const user = userEvent.setup();
  render(
    <GoalPanel
      ownerId="owner"
      today="2026-09-11"
      timezone="UTC"
      initialActive={{ goals: [], hasMore: false }}
      initialCompleted={{ goals: [], hasMore: false }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Set goal" }));
  await user.click(await screen.findByRole("button", { name: /^Training/ }));
  await user.click(screen.getByRole("checkbox", { name: "Make this a recurring goal" }));
  await user.click(screen.getByRole("button", { name: "Create goal" }));
  await waitFor(() =>
    expect(saveGoal).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ repeat: "month", recurringEndDate: null, timezone: "UTC" }),
    ),
  );
});
