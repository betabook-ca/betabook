import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { AnalyticsVolumeChart } from "./analytics-volume-chart";

it("switches the chart metric between sends and distinct days", async () => {
  const user = userEvent.setup();
  render(
    <AnalyticsVolumeChart
      type="boulder"
      journalVisible
      rows={[
        { month: "2024-01", sends: 12, days: 3 },
        { month: "2024-02", sends: 0, days: 2 },
      ]}
    />,
  );
  expect(screen.getByRole("group", { name: "Monthly sends" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Days out" }));
  expect(screen.getByRole("button", { name: "Days out" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("group", { name: "Monthly days out" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "Monthly sends" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Sends" }));
  expect(screen.getByRole("group", { name: "Monthly sends" })).toBeVisible();
});
