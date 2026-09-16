import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import type { AnalyticsLayout } from "@/lib/analytics-layout";
import { buildUserAnalytics } from "@/lib/user-analytics";

import { AnalyticsDashboard } from "./analytics-dashboard";
import { AnalyticsYearFilter } from "./analytics-year-filter";

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

const sends: AnalyticsSendRow[] = [
  ["2024-04-03", 6, "First high point"],
  ["2025-01-01", 3, "Winter warmup"],
  ["2025-08-15", 4, "Summer slab"],
  ["2026-04-02", 7, "New high point"],
  [null, 8, "An undated ascent"],
].map(([dateSent, grade, name], index) => ({
  climbId: index + 1,
  climbName: String(name),
  climbType: "boulder",
  suggestedGrade: Number(grade),
  dateSent: dateSent == null ? null : String(dateSent),
  areaId: 1,
  areaName: "Forestland",
  ascentStyle: "redpoint",
}));

const ALL_YEARS: number[] = [];

function Dashboard({
  initialYears = ALL_YEARS,
  initialLayout,
}: {
  initialYears?: number[];
  initialLayout?: AnalyticsLayout;
}) {
  const [years, setYears] = useState(initialYears);
  return (
    <AnalyticsDashboard
      analytics={buildUserAnalytics(sends, "boulder", undefined, years)}
      sends={sends}
      selectedYears={years}
      scope="boulder"
      journalVisible={false}
      undatedCount={1}
      initialLayout={initialLayout}
      periodPicker={
        <AnalyticsYearFilter
          years={[2023, 2024, 2025, 2026]}
          selected={years}
          onChange={setYears}
        />
      }
    />
  );
}

const yearButton = () => screen.getByRole("button", { name: /^Years: / });
const yearOption = (name: string) => screen.getByRole("menuitemcheckbox", { name });
const tile = (name: string) => screen.getByRole("article", { name });
const calendar = (year: number) => screen.getByRole("region", { name: `Calendar ${year}` });

async function toggleYears(user: ReturnType<typeof userEvent.setup>, ...years: string[]) {
  await user.click(yearButton());
  for (const year of years) await user.click(yearOption(year));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu", { name: "Years" })).not.toBeInTheDocument();
}

it("filters summaries, charts and calendar years together and restores all-time activity", async () => {
  const user = userEvent.setup();
  render(<Dashboard />);
  const progression = () => screen.getByRole("region", { name: "Progression" });
  const breakthroughs = () => screen.getByRole("region", { name: "Breakthroughs" });

  expect(yearButton()).toHaveAccessibleName("Years: All years");
  await toggleYears(user, "2024");
  expect(within(tile("Sends")).getByText("1", { exact: true })).toBeVisible();
  expect(within(tile("Best year")).getByText("2024", { exact: true })).toBeVisible();
  expect(tile("Hardest")).toHaveTextContent("First high point");
  expect(progression()).toHaveTextContent("Personal best V5");
  expect(
    within(breakthroughs())
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["First high point"]);
  expect(calendar(2024)).toBeVisible();

  await toggleYears(user, "2025");
  expect(screen.getByRole("heading", { name: "Activity in 2024–2025" })).toBeVisible();
  await user.click(yearButton());
  expect(
    screen.getAllByRole("menuitemcheckbox", { checked: true }).map((item) => item.textContent),
  ).toEqual(["2024", "2025"]);
  await user.keyboard("{Escape}");
  expect(within(tile("Sends")).getByText("3", { exact: true })).toBeVisible();
  expect(within(tile("Best year")).getByText("2025", { exact: true })).toBeVisible();
  expect(screen.getByText(/Send pyramid:/)).toHaveTextContent("V5: 1 send, V3: 1 send, V2: 1 send");
  expect(screen.getAllByRole("region", { name: /^Calendar \d{4}$/ })).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Newer calendar year" }));
  expect(calendar(2025)).toBeVisible();
  expect(progression()).not.toHaveTextContent("Apr 2026");

  await user.click(yearButton());
  yearOption("2025").focus();
  await user.keyboard(" ");
  await user.click(yearOption("2026"));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("heading", { name: "Activity in 2024, 2026" })).toBeVisible();
  expect(within(tile("Sends")).getByText("2", { exact: true })).toBeVisible();
  expect(progression()).toHaveTextContent("Personal best V6");
  expect(
    within(breakthroughs())
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["New high point", "First high point"]);
  expect(screen.queryByRole("region", { name: "Calendar 2025" })).not.toBeInTheDocument();
  expect(calendar(2024)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Newer calendar year" }));
  expect(calendar(2026)).toBeVisible();

  await user.click(yearButton());
  yearOption("All years").focus();
  await user.keyboard(" {Escape}");
  expect(within(tile("Sends")).getByText("5", { exact: true })).toBeVisible();
  expect(tile("Hardest")).toHaveTextContent("An undated ascent");
  expect(screen.getAllByRole("region", { name: /^Calendar \d{4}$/ })).toHaveLength(1);
  await toggleYears(user, "2023");
  expect(screen.getByText(/^No activity in 2023/)).toHaveAttribute("role", "status");
  expect(screen.queryAllByRole("article")).toEqual([]);
  expect(screen.queryByRole("region", { name: "Progression" })).not.toBeInTheDocument();
  await toggleYears(user, "2023");
  expect(yearButton()).toHaveAccessibleName("Years: All years");
  expect(tile("Hardest")).toHaveTextContent("An undated ascent");
});

it("preserves the saved dashboard order and hidden cards when years change", async () => {
  const user = userEvent.setup();
  render(
    <Dashboard
      initialYears={[2024, 2025]}
      initialLayout={{ cards: ["hardest", "sends"], charts: ["pyramid"] }}
    />,
  );
  const shownCards = () =>
    within(screen.getByRole("region", { name: "At a glance" }))
      .getAllByRole("article")
      .map((card) => card.getAttribute("aria-label"));
  expect(shownCards()).toEqual(["Hardest", "Sends"]);
  await toggleYears(user, "2026");
  expect(screen.getByRole("heading", { name: "Activity in 2024–2026" })).toBeVisible();
  expect(shownCards()).toEqual(["Hardest", "Sends"]);
});
