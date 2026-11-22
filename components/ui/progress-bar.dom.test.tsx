import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

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
