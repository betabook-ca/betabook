import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { DEFAULT_DISCIPLINE_FILTER, type DisciplineFilter } from "@/lib/filters/discipline-filter";

import { FilterToolbar } from "./filter-toolbar";

function Toolbar() {
  const [value, setValue] = useState(DEFAULT_DISCIPLINE_FILTER);
  return (
    <FilterToolbar
      value={value}
      onChange={setValue}
      onReset={() => setValue(DEFAULT_DISCIPLINE_FILTER)}
    />
  );
}
it("retains grade choices across disclosure changes and reset clears disciplines and bounds", async () => {
  const user = userEvent.setup();
  render(<Toolbar />);
  const boulder = screen.getByRole("button", { name: "Boulder" });
  await user.click(boulder);
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  await user.click(await screen.findByRole("option", { name: "V4" }));
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("V4");
  await user.click(screen.getByRole("button", { name: "Hide filters" }));
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("V4");
  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(boulder).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("button", { name: /Min grade/ })).not.toBeInTheDocument();
  await user.click(boulder);
  expect(screen.getByRole("button", { name: /Min grade/ })).toHaveTextContent("VB");
});

function PlacedToolbar({ placement }: { placement?: "row" | "below" }) {
  const [value, setValue] = useState<DisciplineFilter>({
    ...DEFAULT_DISCIPLINE_FILTER,
    disciplines: ["sport"],
  });
  return (
    <FilterToolbar
      value={value}
      onChange={setValue}
      onReset={() => setValue(DEFAULT_DISCIPLINE_FILTER)}
      sortControl={<button type="button">Sort by</button>}
      sortPlacement={placement}
    />
  );
}
it("places the sort control in the toolbar row by default and below the expanded filters on request", async () => {
  const user = userEvent.setup();
  const order = () => {
    const sort = screen.getByRole("group", { name: "Result order" });
    const controls = screen.getByRole("group", { name: "Filter controls" });
    const nodes = [...document.querySelectorAll("*")];
    const after = (node: Element) => nodes.indexOf(sort) > nodes.indexOf(node);
    if (controls.contains(sort)) return "in row";
    return after(screen.getByText("Filtered by")) &&
      after(screen.getByRole("region", { name: "Filter options" }))
      ? "below the panel"
      : "above the panel";
  };
  const { unmount } = render(<PlacedToolbar />);
  expect(order()).toBe("in row");
  expect(screen.getAllByRole("group", { name: "Result order" })).toHaveLength(1);
  unmount();
  render(<PlacedToolbar placement="below" />);
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  expect(order()).toBe("below the panel");
  expect(screen.getAllByRole("group", { name: "Result order" })).toHaveLength(1);
});
