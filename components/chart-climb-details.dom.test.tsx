import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import type { ChartDetailGroup } from "@/lib/chart-details";

import { ChartDetailsPreview, ChartDetailsDialog } from "./chart-climb-details";

const group: ChartDetailGroup = {
  title: "V4",
  summary: "4 sends",
  rows: ["2022-09-10", "2023-10-11", null, "2024-12-12"].map((date, i) => ({
    id: String(i),
    climbId: i + 1,
    climbName: `Climb ${i + 1}`,
    date,
  })),
};

it("shows the selected chart metric and names without adding date groups", () => {
  render(<ChartDetailsPreview group={group} />);
  expect(screen.getByText("V4 · 4 sends")).toBeInTheDocument();
  expect(screen.getByText("Climb 1", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("Climb 4", { exact: true })).toBeInTheDocument();
  expect(screen.queryByText(/2022|2023|2024|Undated/)).not.toBeInTheDocument();
  expect(screen.queryByText("Climb 3", { exact: true })).not.toBeInTheDocument();
});

it("renders a read-only list without dates, column headings, or links", async () => {
  render(<ChartDetailsDialog group={group} onClose={() => {}} />);
  const table = await screen.findByRole("list", { name: "Climbs" });
  expect(within(table).queryByRole("columnheader")).not.toBeInTheDocument();
  expect(within(table).queryByRole("rowheader")).not.toBeInTheDocument();
  expect(within(table).queryByRole("link")).not.toBeInTheDocument();
  expect(within(table).getAllByRole("listitem")).toHaveLength(4);
  expect(table).not.toHaveTextContent(/2022|2023|2024|Undated/);
});

it("lists a repeated climb once without merging different climbs with the same name", () => {
  render(
    <ChartDetailsPreview
      group={{
        ...group,
        title: "Jan 2026",
        summary: "4 days",
        rows: [
          group.rows[0],
          { ...group.rows[0], id: "repeat" },
          { ...group.rows[1], climbName: "Climb 1" },
          group.rows[2],
        ],
      }}
    />,
  );
  expect(screen.getAllByText("Climb 1", { exact: true })).toHaveLength(2);
  expect(screen.getByText("Climb 3", { exact: true })).toBeInTheDocument();
  expect(screen.queryByText(/Select to see/)).not.toBeInTheDocument();
});

it("orders the popup by send date, keeping undated sends last", async () => {
  render(<ChartDetailsDialog group={group} onClose={() => {}} />);
  const list = await screen.findByRole("list", { name: "Climbs" });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Climb 1", "Climb 2", "Climb 4", "Climb 3"]);
});

it("uses the original send date instead of a repeat's session date", async () => {
  render(
    <ChartDetailsDialog
      group={{
        ...group,
        rows: [
          { ...group.rows[0], date: "2026-12-12", sortDate: "2020-01-01" },
          { ...group.rows[1], date: "2021-02-02", sortDate: "2021-02-02" },
          { ...group.rows[2], date: "2019-01-01", sortDate: null },
        ],
      }}
      onClose={() => {}}
    />,
  );
  const list = await screen.findByRole("list", { name: "Climbs" });
  expect(
    within(list)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Climb 1", "Climb 2", "Climb 3"]);
});
