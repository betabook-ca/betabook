import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AnalyticsSendRow } from "@/db/queries";

import { AnalyticsGradePyramid } from "./analytics-grade-pyramid";
import { ProgressionChart } from "./progression-chart";

const sends: AnalyticsSendRow[] = Array.from({ length: 6 }, (_, i) => ({
  climbId: i + 1,
  climbName: `Climb ${i + 1}`,
  climbType: "boulder",
  suggestedGrade: 3,
  areaId: 1,
  areaName: "Forestland",
  ascentStyle: "redpoint",
  dateSent: i === 5 ? null : "2026-09-10",
}));

describe("chart climb details", () => {
  it("limits the focus preview and opens every matching send in a table", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsGradePyramid
        type="boulder"
        rows={[{ grade: 3, label: "V2", count: 6 }]}
        sends={sends}
      />,
    );
    const bar = screen.getByRole("button", { name: /V2.*6 sends/ });
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(/Climb 3/)).toBeInTheDocument();
    expect(within(tooltip).queryByText(/Climb 4/)).not.toBeInTheDocument();
    expect(within(tooltip).getByText("Select to see all")).toBeInTheDocument();
    expect(within(tooltip).queryByText(/Forestland/)).not.toBeInTheDocument();
    await user.click(bar);
    const table = await screen.findByRole("list", { name: "Climbs" });
    expect(within(table).queryByRole("link")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("listitem")).toHaveLength(6);
    expect(within(table).getByText("Climb 6", { exact: true })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader")).not.toBeInTheDocument();
    expect(within(table).queryByText("Forestland")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(bar).toHaveFocus());
  });

  it("shows only sends tied for the month's hardest grade, including keyboard activation", async () => {
    const user = userEvent.setup();
    render(
      <ProgressionChart
        type="boulder"
        points={[{ month: "2026-09", hardest: 3, best: 5 }]}
        sends={[
          sends[0],
          { ...sends[1], suggestedGrade: 2 },
          { ...sends[2], dateSent: "2026-08-10" },
          { ...sends[3], climbType: "sport" },
          sends[5],
        ]}
      />,
    );
    const point = screen.getByRole("button", { name: /Sep 2026.*V2/ });
    point.focus();
    await user.keyboard("{Enter}");
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(/Climb 1/)).toBeInTheDocument();
    expect(tooltip).not.toHaveTextContent("1 send");
    expect(within(tooltip).queryByText(/Climb [2-6]/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("previews all three climbs without offering or opening a table", async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsGradePyramid
        type="boulder"
        rows={[{ grade: 3, label: "V2", count: 3 }]}
        sends={sends.slice(0, 3)}
      />,
    );
    await user.tab();
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(/Climb 1/)).toBeInTheDocument();
    expect(within(tooltip).getByText(/Climb 3/)).toBeInTheDocument();
    expect(within(tooltip).queryByText(/\d+ more/)).not.toBeInTheDocument();
    expect(within(tooltip).queryByText(/view all climbs/i)).not.toBeInTheDocument();
    const bar = screen.getByRole("button", { name: /V2.*3 sends/ });
    expect(bar).not.toHaveAttribute("aria-haspopup");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(bar);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
