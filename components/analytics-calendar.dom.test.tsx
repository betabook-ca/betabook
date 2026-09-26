import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { AnalyticsCalendar } from "./analytics-calendar";

it("names the displayed year as a status so year changes are announced with context", async () => {
  const user = userEvent.setup();
  render(
    <AnalyticsCalendar
      years={[2024, 2025]}
      countsByDay={{}}
      hue="oklch(0.6 0.1 200)"
      unit="send"
    />,
  );
  const year = screen.getByRole("status", { name: "Displayed calendar year" });
  expect(year).toHaveTextContent("2025");
  await user.click(screen.getByRole("button", { name: "Older calendar year" }));
  expect(year).toHaveTextContent("2024");
});
