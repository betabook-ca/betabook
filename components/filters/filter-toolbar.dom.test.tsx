import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";

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
