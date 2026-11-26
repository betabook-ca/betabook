import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

import { RatingField } from "./rating-field";

function Rating() {
  const [value, setValue] = useState<number | null>(3);
  return (
    <>
      <RatingField value={value} onValueChange={setValue} />
      <button type="button">Next field</button>
    </>
  );
}

it("tabs to the selected rating and uses arrow keys to select and wrap within the group", async () => {
  const user = userEvent.setup();
  render(<Rating />);
  await user.tab();
  expect(screen.getByRole("radio", { name: "3 stars" })).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  const fourth = screen.getByRole("radio", { name: "4 stars" });
  expect(fourth).toHaveFocus();
  expect(fourth).toBeChecked();
  await user.keyboard("{ArrowDown}{ArrowRight}");
  expect(screen.getByRole("radio", { name: "1 star" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "1 star" })).toBeChecked();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("radio", { name: "5 stars" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "5 stars" })).toBeChecked();
  await user.tab();
  expect(screen.getByRole("button", { name: "Next field" })).toHaveFocus();
});
