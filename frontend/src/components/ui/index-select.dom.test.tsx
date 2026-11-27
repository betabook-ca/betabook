import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { IndexRangeSelect } from "./index-select";

function Range() {
  const [range, setRange] = useState<[number, number]>([0, 2]);
  const options = ["V0", "V1", "V2", "V3", "V4", "V5"];
  return (
    <IndexRangeSelect
      label="Range"
      minLabel="Minimum"
      maxLabel="Maximum"
      range={range}
      onChange={setRange}
      options={options}
    />
  );
}
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(label) }));
  await user.click(await screen.findByRole("option", { name: option }));
}
it("clamps the opposite grade bound in both directions", async () => {
  const user = userEvent.setup();
  render(<Range />);
  await choose(user, "Minimum", "V5");
  expect(screen.getByRole("button", { name: /Minimum/ })).toHaveTextContent("V5");
  expect(screen.getByRole("button", { name: /Maximum/ })).toHaveTextContent("V5");
  await choose(user, "Maximum", "V0");
  expect(screen.getByRole("button", { name: /Minimum/ })).toHaveTextContent("V0");
  expect(screen.getByRole("button", { name: /Maximum/ })).toHaveTextContent("V0");
});
