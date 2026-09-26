import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import { DEFAULT_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import { buildUserAnalytics } from "@/lib/user-analytics";

import { AnalyticsDashboard } from "./analytics-dashboard";

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      public observe = vi.fn<IntersectionObserver["observe"]>();
      public disconnect = vi.fn<IntersectionObserver["disconnect"]>();
    },
  );
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: true,
    media,
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    addListener: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
  }));
});

const sends: AnalyticsSendRow[] = ["2024-01-01", "2025-02-02", "2026-03-03", null].map(
  (dateSent, i) => ({
    climbId: i + 1,
    climbName: `Climb ${i + 1}`,
    climbType: "boulder",
    suggestedGrade: 3,
    areaId: 1,
    areaName: "Forestland",
    ascentStyle: "redpoint",
    dateSent,
  }),
);

describe("analytics dashboard climb previews", () => {
  it("uses only the selected years and excludes undated sends from that period", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsDashboard
        analytics={buildUserAnalytics(sends, "boulder", undefined, [2025])}
        sends={sends}
        selectedYears={[2025]}
        undatedCount={1}
        scope="boulder"
        journalVisible={false}
        periodPicker={null}
      />,
    );
    const pyramid = within(screen.getByRole("article", { name: /^Grade pyramid$/ }));
    await user.click(pyramid.getByRole("button", { name: /V2: 1 send/ }));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Climb 2", { exact: true })).toBeInTheDocument();
    expect(within(tooltip).queryByText(/Climb [134]/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("uses sends for Days out when journal access is unavailable", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsDashboard
        analytics={buildUserAnalytics(sends, "boulder", undefined, [2025])}
        sends={sends}
        selectedYears={[2025]}
        undatedCount={1}
        scope="boulder"
        journalVisible={false}
        sessions={[
          {
            id: 99,
            climbId: 99,
            climbName: "Journal-only climb",
            climbType: "boulder",
            entryDate: "2025-02-02",
            sent: false,
            isAscent: false,
          },
        ]}
        initialLayout={{ ...DEFAULT_ANALYTICS_LAYOUT, charts: ["volume"] }}
        periodPicker={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Days out" }));
    screen.getByRole("group", { name: "Monthly days out" }).focus();
    await user.keyboard("{Home}");
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("1 day");
    expect(tooltip).toHaveTextContent("Climb 2");
    expect(tooltip).not.toHaveTextContent("Journal-only climb");
  });
});

it("shows only the status for a selected period with no activity", () => {
  render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(sends, "boulder", undefined, [2023])}
      sends={sends}
      selectedYears={[2023]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      canCustomize
      periodPicker={null}
    />,
  );

  expect(screen.getByText(/^No activity in 2023/)).toHaveAttribute("role", "status");
  expect(screen.queryAllByRole("article")).toEqual([]);
  expect(screen.queryByRole("region", { name: "At a glance" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Customize dashboard" })).not.toBeInTheDocument();
});

it("heads every chart panel with a level-3 heading under the activity heading", () => {
  render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(sends, "boulder")}
      sends={sends}
      selectedYears={[]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      initialLayout={{
        ...DEFAULT_ANALYTICS_LAYOUT,
        charts: ["volume", "flashRate", "progression", "pyramid", "breakthroughs", "calendar"],
      }}
      periodPicker={null}
    />,
  );

  expect(screen.getByRole("heading", { level: 2, name: "All-time activity" })).toBeInTheDocument();
  expect(
    screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
  ).toEqual([
    "Volume over time",
    "Flash rate by grade",
    "Progression",
    "Grade pyramid",
    "Breakthroughs",
    "Sending calendar",
  ]);
});

it("summarizes the climber under the activity heading", () => {
  const summary = "Climbing since 2024. 4 sends across 1 area. Last sent Mar 3, 2026.";
  render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(sends, "boulder")}
      sends={sends}
      selectedYears={[]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      summary={summary}
      periodPicker={null}
    />,
  );

  const heading = screen.getByRole("heading", { name: "All-time activity" });
  expect(heading.nextElementSibling).toBe(screen.getByText(summary));
});

it("combines calendar disciplines independently of the grade-chart scope", async () => {
  const user = userEvent.setup();
  const mixedSends: AnalyticsSendRow[] = [
    ...sends,
    { ...sends[1], climbId: 99, climbType: "sport", dateSent: "2025-02-03" },
    { ...sends[1], climbId: 100, climbType: "trad", dateSent: "2025-02-04" },
  ];
  render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(mixedSends, "boulder")}
      sends={mixedSends}
      selectedYears={[]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      periodPicker={null}
    />,
  );

  const filter = screen.getByRole("button", { name: "Calendar disciplines: All disciplines" });
  expect(filter).toBeVisible();
  // The calendar opens on the newest year (2026), so one step back reaches 2025.
  await user.click(screen.getByRole("button", { name: "Older calendar year" }));
  expect(screen.getByRole("region", { name: "Calendar 2025" })).toHaveTextContent(
    "3 climbing days in 2025.",
  );

  await user.click(filter);
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Sport" }));
  await user.keyboard("{Escape}");
  expect(filter).toHaveAccessibleName("Calendar disciplines: Sport");
  expect(screen.getByRole("region", { name: "Calendar 2025" })).toHaveTextContent(
    "1 climbing day in 2025.",
  );

  await user.click(filter);
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Boulder" }));
  await user.keyboard("{Escape}");
  expect(filter).toHaveAccessibleName("Calendar disciplines: Boulder + Sport");
  // Re-adding boulder brings 2024/2026 back into range, remounting the
  // calendar on the newest year again — one step back reaches 2025.
  await user.click(screen.getByRole("button", { name: "Older calendar year" }));
  expect(screen.getByRole("region", { name: "Calendar 2025" })).toHaveTextContent(
    "2 climbing days in 2025.",
  );

  await user.click(filter);
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Trad" }));
  await user.keyboard("{Escape}");
  expect(filter).toHaveAccessibleName("Calendar disciplines: All disciplines");
  expect(screen.getByRole("region", { name: "Calendar 2025" })).toHaveTextContent(
    "3 climbing days in 2025.",
  );
});

it("offers only disciplines with dated activity in the selected years", async () => {
  const user = userEvent.setup();
  const mixedSends: AnalyticsSendRow[] = [
    ...sends,
    { ...sends[1], climbId: 99, climbType: "sport", dateSent: "2025-02-03" },
    { ...sends[1], climbId: 100, climbType: "trad", dateSent: "2023-02-04" },
    { ...sends[1], climbId: 101, climbType: "trad", dateSent: null },
  ];
  const { rerender } = render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(mixedSends, "boulder", undefined, [2025])}
      sends={mixedSends}
      selectedYears={[2025]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      periodPicker={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Calendar disciplines: All disciplines" }));
  expect(screen.getByRole("menuitemcheckbox", { name: "Boulder" })).toBeVisible();
  expect(screen.getByRole("menuitemcheckbox", { name: "Sport" })).toBeVisible();
  expect(screen.queryByRole("menuitemcheckbox", { name: "Trad" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");

  rerender(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(mixedSends, "boulder", undefined, [2023])}
      sends={mixedSends}
      selectedYears={[2023]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      periodPicker={null}
    />,
  );
  expect(screen.queryByRole("button", { name: /Calendar disciplines/ })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Calendar 2023" })).toHaveTextContent(
    "1 climbing day in 2023.",
  );
});

it("keeps the combined calendar when the page discipline has no activity in a selected year", () => {
  const mixedSends: AnalyticsSendRow[] = [
    ...sends,
    { ...sends[1], climbId: 99, climbType: "sport", dateSent: "2023-02-03" },
  ];
  render(
    <AnalyticsDashboard
      analytics={buildUserAnalytics(mixedSends, "boulder", undefined, [2023])}
      sends={mixedSends}
      selectedYears={[2023]}
      undatedCount={1}
      scope="boulder"
      journalVisible={false}
      periodPicker={null}
    />,
  );

  expect(screen.getByText(/^No activity in 2023/)).toHaveAttribute("role", "status");
  expect(screen.getByRole("article", { name: "Sending calendar" })).toBeVisible();
  expect(screen.getByRole("region", { name: "Calendar 2023" })).toHaveTextContent(
    "1 climbing day in 2023.",
  );
});
