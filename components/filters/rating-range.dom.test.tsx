import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { ClimbFilterControls } from "@/components/filters/climb-filter-controls";
import { RatingRangeFilter } from "@/components/filters/min-rating-filter";
import { RatingField } from "@/components/ui/rating-field";
import { DEFAULT_CLIMB_FILTER } from "@/lib/filters/climb-filter";
import type { ClimbFilterState } from "@/lib/filters/climb-filter-state";

function Controls() {
  const [value, setValue] = useState<ClimbFilterState>({
    sort: "name_asc",
    area: null,
    filter: DEFAULT_CLIMB_FILTER,
  });
  return <ClimbFilterControls value={value} onChange={(next) => setValue({ ...value, ...next })} />;
}
function Range() {
  const [value, setValue] = useState<[number, number]>([1, 5]);
  return <RatingRangeFilter value={value} onChange={setValue} />;
}
function Rating() {
  const [value, setValue] = useState<number | null>(3);
  return <RatingField value={value} onValueChange={setValue} />;
}
const bound = (name: string) => within(screen.getByRole("radiogroup", { name }));
it("keeps ordered bounds selected when crossing or selecting the same star", async () => {
  const user = userEvent.setup();
  render(<Range />);
  await user.click(bound("Max rating").getByRole("radio", { name: "3 stars" }));
  await user.click(bound("Min rating").getByRole("radio", { name: "5 stars" }));
  expect(bound("Max rating").getByRole("radio", { name: "5 stars" })).toBeChecked();
  await user.click(bound("Max rating").getByRole("radio", { name: "2 stars" }));
  expect(bound("Min rating").getByRole("radio", { name: "2 stars" })).toBeChecked();
  await user.keyboard(" ");
  expect(bound("Max rating").getByRole("radio", { name: "2 stars" })).toBeChecked();
});
it("clears the single Log entry rating by selecting its star again", async () => {
  const user = userEvent.setup();
  render(<Rating />);
  await user.click(bound("Rating").getByRole("radio", { name: "3 stars" }));
  expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  await user.click(bound("Rating").getByRole("radio", { name: "2 stars" }));
  expect(screen.getByRole("radio", { name: "2 stars" })).toBeChecked();
  await user.keyboard(" ");
  expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
});
it.each([1, 2, 3, 4])(
  "summarizes maximum %s while collapsed and removal resets both bounds",
  async (max) => {
    const user = userEvent.setup();
    render(<Controls />);
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    await user.click(
      bound("Max rating").getByRole("radio", { name: `${max} ${max === 1 ? "star" : "stars"}` }),
    );
    await user.click(screen.getByRole("button", { name: "Hide filters" }));
    const tag = screen.getByRole("button", {
      name: `Remove Rating: ${max === 1 ? "1 star" : `1–${max} stars`}`,
    });
    await user.click(tag);
    expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand filters" }));
    expect(bound("Min rating").getByRole("radio", { name: "1 star" })).toBeChecked();
    expect(bound("Max rating").getByRole("radio", { name: "5 stars" })).toBeChecked();
  },
);
it("clears all active disciplines and rating bounds globally", async () => {
  const user = userEvent.setup();
  render(<Controls />);
  await user.click(screen.getByRole("button", { name: "Boulder" }));
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(bound("Min rating").getByRole("radio", { name: "3 stars" }));
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  expect(screen.getByRole("button", { name: "Remove Rating: 3–5 stars" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove Boulder" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Boulder" })).toHaveAttribute("aria-pressed", "false");
});
