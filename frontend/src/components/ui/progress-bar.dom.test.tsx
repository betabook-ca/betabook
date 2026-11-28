import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { AmountMeter, ProgressBar } from "./progress-bar";

it.each([
  [12, "10"],
  [-2, "0"],
  [4, "4"],
])("reports %d of 10 as the value the bar fills to", (value, expected) => {
  render(<ProgressBar value={value} max={10} label="Sessions" />);
  expect(screen.getByRole("progressbar", { name: "Sessions" })).toHaveAttribute(
    "aria-valuenow",
    expected,
  );
});

it("reports a measured amount as a meter, not a task's progress", () => {
  render(<AmountMeter value={3} max={5} label="Train 5 times" />);
  expect(screen.getByRole("meter", { name: "Train 5 times" })).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
