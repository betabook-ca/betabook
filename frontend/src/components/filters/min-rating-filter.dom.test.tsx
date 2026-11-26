import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { RatingRangeFilter } from "./min-rating-filter";

function Range() {
  const [value, setValue] = useState<[number, number]>([1, 5]);
  return <RatingRangeFilter value={value} onChange={setValue} />;
}

it("explains unrated inclusion when either bound changes and when the full range is restored", async () => {
  const user = userEvent.setup();
  render(<Range />);
  expect(screen.getByText("Includes unrated climbs")).toBeInTheDocument();
  const min = within(screen.getByRole("radiogroup", { name: "Min rating" }));
  const max = within(screen.getByRole("radiogroup", { name: "Max rating" }));
  await user.click(min.getByRole("radio", { name: "3 stars" }));
  expect(screen.getByText("Excludes unrated climbs")).toBeInTheDocument();
  await user.click(min.getByRole("radio", { name: "1 star" }));
  expect(screen.getByText("Includes unrated climbs")).toBeInTheDocument();
  await user.click(max.getByRole("radio", { name: "4 stars" }));
  expect(screen.getByText("Excludes unrated climbs")).toBeInTheDocument();
  await user.click(max.getByRole("radio", { name: "5 stars" }));
  expect(screen.getByText("Includes unrated climbs")).toBeInTheDocument();
});
