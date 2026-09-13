import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { ChartDetailGroup } from "@/lib/chart-details";

import { ChartInspection } from "./chart-inspection";

const group: ChartDetailGroup = {
  title: "Jan 2026",
  summary: "2 days · 4 sessions",

  rows: Array.from({ length: 4 }, (_, i) => ({
    id: `session-${i}`,
    climbId: i + 1,
    climbName: "Cedar Arete",
    date: i < 2 ? "2026-01-02" : "2026-01-03",
    detail: i ? "Repeat" : "Send",
  })),
};

it("previews three climbs and opens the full list from the keyboard", async () => {
  const user = userEvent.setup();
  render(
    <ChartInspection label="Days out" details={{ January: group }}>
      <span data-chart-detail="January">January</span>
    </ChartInspection>,
  );
  await user.tab();
  await user.keyboard("{Home}");
  const tooltip = screen.getByRole("tooltip");
  expect(within(tooltip).getAllByText(/Cedar Arete/)).toHaveLength(3);
  expect(within(tooltip).getByText("Select to see all")).toBeInTheDocument();
  await user.keyboard("{Enter}");
  const table = await screen.findByRole("list", { name: "Climbs" });
  expect(within(table).getAllByRole("listitem")).toHaveLength(4);
  expect(within(table).queryByRole("rowheader")).not.toBeInTheDocument();
  expect(table).not.toHaveTextContent("2026-01-03");
  expect(within(table).queryByText("Repeat")).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps complete previews and zero activity out of the table", async () => {
  const user = userEvent.setup();
  render(
    <ChartInspection
      label="Days out"
      details={{
        January: { ...group, rows: group.rows.slice(0, 3) },
        February: { ...group, rows: [] },
      }}
    >
      <span data-chart-detail="January">January</span>
      <span data-chart-detail="February">February</span>
    </ChartInspection>,
  );
  await user.tab();
  await user.keyboard("{Home}{Enter}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("tooltip")).not.toHaveTextContent("Select to see all");
  await user.keyboard("{End}{Enter}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
