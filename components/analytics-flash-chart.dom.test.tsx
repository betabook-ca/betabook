import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";
import { buildUserAnalytics } from "@/lib/user-analytics";

import { AnalyticsFlashChart } from "./analytics-flash-chart";

// Rope climbs: only they can carry an onsight, and each chart counts only
// its own style.
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
const rows = buildUserAnalytics(sends, "sport").styleRatesByGrade[0].rows;

it("counts only flashes toward the flash rate and shows all sends at the selected grade", async () => {
  const user = userEvent.setup();
  render(<AnalyticsFlashChart type="sport" rows={rows} sends={sends} />);
  expect(screen.getByRole("heading", { name: "Flash rate by grade" })).toBeVisible();
  await user.tab();
  await user.keyboard("{Home}");
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("3 sends");
  expect(tooltip).toHaveTextContent("33% flash rate");
  expect(within(tooltip).getByText("Climb 1", { exact: true })).toBeInTheDocument();
  expect(within(tooltip).getByText("Climb 2", { exact: true })).toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tooltip")).toHaveTextContent("25% flash rate");
  await user.keyboard("{Enter}");
  const table = await screen.findByRole("list", { name: "Climbs" });
  expect(
    within(table)
      .getAllByRole("listitem")
      .map((link) => link.textContent),
  ).toEqual(["Climb 4", "Climb 5", "Climb 6", "Climb 7"]);
  expect(within(table).queryByText(/Undated/)).not.toBeInTheDocument();
});

it("counts only onsights toward the onsight rate", async () => {
  const user = userEvent.setup();
  render(<AnalyticsFlashChart type="sport" rows={rows} sends={sends} ascentStyle="onsight" />);
  expect(screen.getByRole("heading", { name: "Onsight rate by grade" })).toBeVisible();
  await user.tab();
  await user.keyboard("{Home}");
  expect(screen.getByRole("tooltip")).toHaveTextContent("33% onsight rate");
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("tooltip")).toHaveTextContent("0% onsight rate");
});
