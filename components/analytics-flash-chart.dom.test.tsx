import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import { buildUserAnalytics } from "@/lib/user-analytics";

import { AnalyticsFlashChart } from "./analytics-flash-chart";

it("counts flashes and onsights as first tries and shows all sends at the selected grade", async () => {
  const user = userEvent.setup();
  // Rope climbs: only they can carry an onsight, and the numerator must
  // count it alongside the flash.
  const sends: AnalyticsSendRow[] = Array.from({ length: 7 }, (_, i) => ({
    climbId: i + 1,
    climbName: `Climb ${i + 1}`,
    climbType: "sport",
    suggestedGrade: i < 3 ? 10 : 11,
    areaId: 1,
    areaName: "Forestland",
    dateSent: i === 6 ? null : "2026-01-02",
    ascentStyle: i === 0 || i === 3 ? "flash" : i === 1 ? "onsight" : "redpoint",
  }));
  render(
    <AnalyticsFlashChart
      type="sport"
      rows={buildUserAnalytics(sends, "sport").firstTryByGrade[0].rows}
      sends={sends}
    />,
  );
  await user.tab();
  await user.keyboard("{Home}");
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("3 sends");
  expect(tooltip).toHaveTextContent("67% first-try rate");
  expect(within(tooltip).getByText("Climb 1", { exact: true })).toBeInTheDocument();
  expect(within(tooltip).getByText("Climb 2", { exact: true })).toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tooltip")).toHaveTextContent("25% first-try rate");
  await user.keyboard("{Enter}");
  const table = await screen.findByRole("list", { name: "Climbs" });
  expect(
    within(table)
      .getAllByRole("listitem")
      .map((link) => link.textContent),
  ).toEqual(["Climb 4", "Climb 5", "Climb 6", "Climb 7"]);
  expect(within(table).queryByText(/Undated/)).not.toBeInTheDocument();
});
