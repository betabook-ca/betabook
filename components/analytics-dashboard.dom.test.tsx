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
